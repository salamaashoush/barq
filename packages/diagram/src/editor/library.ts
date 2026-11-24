import {
  APP_NAME,
  DEFAULT_SIDEBAR,
  Emitter,
  LIBRARY_SIDEBAR_TAB,
  Queue,
  URL_HASH_KEYS,
  URL_QUERY_KEYS,
  arrayToMap,
  cloneJSON,
  preventUnload,
  promiseTry,
  resolvablePromise,
  toValidURL,
} from "@excalidraw/common";

import { hashElementsVersion } from "@excalidraw/element";

import { loadLibraryFromBlob } from "../data/blob.ts";
import { getLibraryItemsHash, mergeLibraryItems, validateLibraryUrl } from "../data/library.ts";
import { restoreLibraryItems } from "../data/restore.ts";
import { type TranslationKey, type TranslationReplacement, translate } from "../i18n.ts";

import type { AppState, LibraryItem, LibraryItems, LibraryItems_anyVersion } from "../types.ts";

type MaybePromise<T> = T | Promise<T>;

/** What `updateLibrary` takes: items, a `.excalidrawlib` blob, or a function of the current items giving either. */
export type LibraryItemsSource =
  | ((
      currentLibraryItems: LibraryItems,
    ) => MaybePromise<LibraryItems_anyVersion | Blob> | Promise<LibraryItems_anyVersion | Blob>)
  | MaybePromise<LibraryItems_anyVersion | Blob>;

/** The items added, removed and changed since the last change, Excalidraw's `LibraryUpdate`. */
export interface LibraryUpdate {
  deletedItems: Map<LibraryItem["id"], LibraryItem>;
  addedItems: Map<LibraryItem["id"], LibraryItem>;
  updatedItems: Map<LibraryItem["id"], LibraryItem>;
}

export type LibraryPersistedData = { libraryItems: LibraryItems };

export type LibraryAdapterSource = "load" | "save";

export interface LibraryLoadMetadata {
  source: LibraryAdapterSource;
}

export interface LoadedLibrary {
  libraryItems: LibraryItems_anyVersion;
}

/** Where a library is kept, Excalidraw's `LibraryPersistenceAdapter`. */
export interface LibraryPersistenceAdapter {
  /** The data `save` last stored; `source` says whether it is read to save or to show. */
  load(metadata: LibraryLoadMetadata): MaybePromise<LoadedLibrary | null>;
  /** Stores the data as it is. Throws when it cannot. */
  save(libraryData: LibraryPersistedData): MaybePromise<void>;
}

/** A store a library moves out of once, Excalidraw's `LibraryMigrationAdapter`. */
export interface LibraryMigrationAdapter {
  /** The legacy data, `null` when there is nothing to move. */
  load(): MaybePromise<LoadedLibrary | null>;
  /** Empties the legacy store once its data has moved. */
  clear(): MaybePromise<void>;
}

/** The library as the UI shows it: `loading` while an update is queued. */
export interface LibraryState {
  status: "loading" | "loaded";
  /** Whether the library has been through an update, after which it is no longer first loading. */
  isInitialized: boolean;
  libraryItems: LibraryItems;
}

/** What the library asks of its editor. */
export interface LibraryHost {
  setState(state: Partial<AppState>): void;
  focusContainer(): void;
  readonly ownerWindow: Window;
}

class AbortError extends Error {
  public constructor() {
    super("Request Aborted");
    this.name = "AbortError";
  }
}

function cloneLibraryItems(libraryItems: LibraryItems): LibraryItems {
  return cloneJSON(libraryItems);
}

function getLibraryItemHash(item: LibraryItem): string {
  return `${item.id}:${item.name ?? ""}:${hashElementsVersion(item.elements)}`;
}

function createLibraryUpdate(
  prevLibraryItems: LibraryItems,
  nextLibraryItems: LibraryItems,
): LibraryUpdate {
  const nextItemsMap = arrayToMap(nextLibraryItems);
  const update: LibraryUpdate = {
    deletedItems: new Map(),
    addedItems: new Map(),
    updatedItems: new Map(),
  };
  for (const item of prevLibraryItems) {
    if (!nextItemsMap.has(item.id)) {
      update.deletedItems.set(item.id, item);
    }
  }
  const prevItemsMap = arrayToMap(prevLibraryItems);
  for (const item of nextLibraryItems) {
    const prevItem = prevItemsMap.get(item.id);
    if (!prevItem) {
      update.addedItems.set(item.id, item);
    } else if (getLibraryItemHash(prevItem) !== getLibraryItemHash(item)) {
      update.updatedItems.set(item.id, item);
    }
  }
  return update;
}

/**
 * Every library's changes, for `handleLibrary` to persist: one emitter for
 * the page, as Excalidraw's, so a persistence outlives an editor remounting.
 */
const onLibraryUpdateEmitter = new Emitter<[update: LibraryUpdate, libraryItems: LibraryItems]>();

export interface UpdateLibraryOptions {
  libraryItems: LibraryItemsSource;
  merge?: boolean;
  prompt?: boolean;
  openLibraryMenu?: boolean;
  defaultStatus?: "unpublished" | "published";
}

/**
 * An editor's library, Excalidraw's `Library`: its items, changed through a
 * queue so that updates resolve in the order they were asked for, each
 * announced to `onChange` (the UI and the host's `onLibraryChange`) once the
 * queue is empty.
 */
export class Library {
  private currLibraryItems: LibraryItems = [];
  private prevLibraryItems: LibraryItems = [];
  private updateQueue: Promise<LibraryItems>[] = [];
  private current: LibraryState = { status: "loaded", isInitialized: false, libraryItems: [] };
  private readonly stateEmitter = new Emitter<[state: LibraryState]>();
  private readonly changeEmitter = new Emitter<[libraryItems: LibraryItems]>();

  /** The words the confirmation of an install is asked in; English unless the UI gives its own. */
  public translate: (path: TranslationKey, replacement?: TranslationReplacement) => string = (
    path,
    replacement,
  ) => translate(undefined, path, replacement);

  public constructor(private readonly host: LibraryHost) {}

  public get state(): LibraryState {
    return this.current;
  }

  /** Follows the library's items and status; the returned function stops. */
  public onStateChange(listener: (state: LibraryState) => void): () => void {
    return this.stateEmitter.on(listener);
  }

  /** Called with a copy of the items after each settled update, Excalidraw's `onLibraryChange`. */
  public onChange(listener: (libraryItems: LibraryItems) => void): () => void {
    return this.changeEmitter.on(listener);
  }

  private getLastUpdateTask(): Promise<LibraryItems> | undefined {
    return this.updateQueue[this.updateQueue.length - 1];
  }

  private notifyListeners(): void {
    if (this.updateQueue.length > 0) {
      this.current = {
        status: "loading",
        libraryItems: this.currLibraryItems,
        isInitialized: this.current.isInitialized,
      };
      this.stateEmitter.trigger(this.current);
      return;
    }
    this.current = { status: "loaded", libraryItems: this.currLibraryItems, isInitialized: true };
    this.stateEmitter.trigger(this.current);
    try {
      const prevLibraryItems = this.prevLibraryItems;
      this.prevLibraryItems = cloneLibraryItems(this.currLibraryItems);
      const nextLibraryItems = cloneLibraryItems(this.currLibraryItems);
      this.changeEmitter.trigger(nextLibraryItems);
      onLibraryUpdateEmitter.trigger(
        createLibraryUpdate(prevLibraryItems, nextLibraryItems),
        nextLibraryItems,
      );
    } catch (error) {
      console.error(error);
    }
  }

  public destroy(): void {
    this.updateQueue = [];
    this.currLibraryItems = [];
    this.stateEmitter.clear();
    this.changeEmitter.clear();
  }

  public resetLibrary(): Promise<LibraryItems> {
    return this.setLibrary([]);
  }

  /** A copy of the items once every queued update has settled. */
  public async getLatestLibrary(): Promise<LibraryItems> {
    try {
      const libraryItems = await (this.getLastUpdateTask() ?? this.currLibraryItems);
      if (this.updateQueue.length > 0) {
        return this.getLatestLibrary();
      }
      return cloneLibraryItems(libraryItems);
    } catch {
      return this.currLibraryItems;
    }
  }

  /**
   * Excalidraw's `updateLibrary`: items or a library file, restored, merged
   * with the current ones or replacing them, after asking the reader first
   * with `prompt`; `openLibraryMenu` opens the sidebar on the library.
   */
  public updateLibrary = async ({
    libraryItems,
    prompt = false,
    merge = false,
    openLibraryMenu = false,
    defaultStatus = "unpublished",
  }: UpdateLibraryOptions): Promise<LibraryItems> => {
    if (openLibraryMenu) {
      this.host.setState({
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB },
      });
    }
    return this.setLibrary(async () => {
      const source = await (typeof libraryItems === "function" && !(libraryItems instanceof Blob)
        ? libraryItems(this.currLibraryItems)
        : libraryItems);
      const nextItems =
        source instanceof Blob
          ? await loadLibraryFromBlob(source, defaultStatus)
          : restoreLibraryItems(source, defaultStatus);
      if (
        prompt &&
        !this.host.ownerWindow.confirm(
          this.translate("alerts.confirmAddLibrary", { numShapes: nextItems.length }),
        )
      ) {
        throw new AbortError();
      }
      if (prompt) {
        this.host.focusContainer();
      }
      return merge ? mergeLibraryItems(this.currLibraryItems, nextItems) : nextItems;
    });
  };

  /**
   * Replaces the items: a list, a promise of one, or a function of the
   * current items run once the updates before it have settled. A promise
   * rejected with an `AbortError` leaves the library as it was.
   */
  public setLibrary(
    libraryItems:
      | LibraryItems
      | Promise<LibraryItems>
      | ((latestLibraryItems: LibraryItems) => LibraryItems | Promise<LibraryItems>),
  ): Promise<LibraryItems> {
    const task: Promise<LibraryItems> = (async () => {
      await this.getLastUpdateTask()?.catch(() => undefined);
      const next =
        typeof libraryItems === "function" ? libraryItems(this.currLibraryItems) : libraryItems;
      this.currLibraryItems = cloneLibraryItems(await next);
      return this.currLibraryItems;
    })()
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          console.warn("Library update aborted by user");
          return this.currLibraryItems;
        }
        throw error;
      })
      .finally(() => {
        this.updateQueue = this.updateQueue.filter((queued) => queued !== task);
        this.notifyListeners();
      });
    this.updateQueue.push(task);
    this.notifyListeners();
    return task;
  }
}

export interface LibraryUrlTokens {
  libraryUrl: string;
  idToken: string | null;
}

/** The library a page was opened to install, from `#addLibrary=` (or the legacy `?addLibrary=`). */
export function parseLibraryTokensFromUrl(
  location: Pick<Location, "hash" | "search"> = window.location,
): LibraryUrlTokens | null {
  const libraryUrl =
    new URLSearchParams(location.hash.slice(1)).get(URL_HASH_KEYS.addLibrary) ??
    new URLSearchParams(location.search).get(URL_QUERY_KEYS.addLibrary);
  const idToken = libraryUrl ? new URLSearchParams(location.hash.slice(1)).get("token") : null;
  return libraryUrl ? { libraryUrl, idToken } : null;
}

class AdapterTransaction {
  public static readonly queue = new Queue();

  public static async getLibraryItems(
    adapter: LibraryPersistenceAdapter,
    source: LibraryAdapterSource,
    queued = true,
  ): Promise<LibraryItems> {
    async function task(): Promise<LibraryItems> {
      const data = await adapter.load({ source });
      return restoreLibraryItems(data?.libraryItems ?? [], "published");
    }
    return queued ? AdapterTransaction.queue.push(task) : task();
  }

  public static run<T>(
    adapter: LibraryPersistenceAdapter,
    fn: (transaction: AdapterTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction = new AdapterTransaction(adapter);
    return AdapterTransaction.queue.push(() => fn(transaction));
  }

  private constructor(private readonly adapter: LibraryPersistenceAdapter) {}

  public getLibraryItems(source: LibraryAdapterSource): Promise<LibraryItems> {
    return AdapterTransaction.getLibraryItems(this.adapter, source, false);
  }
}

let lastSavedLibraryItemsHash = 0;
let librarySaveCounter = 0;

/**
 * Applies an update to the stored items rather than overwriting them, so
 * items another editor stored, or that never reached this one, are kept.
 */
async function persistLibraryUpdate(
  adapter: LibraryPersistenceAdapter,
  update: LibraryUpdate,
): Promise<LibraryItems> {
  try {
    librarySaveCounter++;
    return await AdapterTransaction.run(adapter, async (transaction) => {
      const nextLibraryItemsMap = arrayToMap(await transaction.getLibraryItems("save"));
      for (const [id] of update.deletedItems) {
        nextLibraryItemsMap.delete(id);
      }
      const addedItems: LibraryItem[] = [];
      for (const [id, item] of update.addedItems) {
        if (nextLibraryItemsMap.has(id)) {
          nextLibraryItemsMap.set(id, item);
        } else {
          // new items go first, as the editor puts them
          addedItems.push(item);
        }
      }
      for (const [id, item] of update.updatedItems) {
        nextLibraryItemsMap.set(id, item);
      }
      const nextLibraryItems = addedItems.concat([...nextLibraryItemsMap.values()]);
      const version = getLibraryItemsHash(nextLibraryItems);
      if (version !== lastSavedLibraryItemsHash) {
        await adapter.save({ libraryItems: nextLibraryItems });
      }
      lastSavedLibraryItemsHash = version;
      return nextLibraryItems;
    });
  } finally {
    librarySaveCounter--;
  }
}

export interface AppStatePatch {
  appState?: Partial<AppState>;
}

/** The part of the editor's API `handleLibrary` drives. */
export interface LibraryApi {
  /** The editor's token, which a library site sends back to install without asking. */
  readonly id: string;
  updateLibrary: Library["updateLibrary"];
  updateScene(scene: AppStatePatch): void;
}

export interface HandleLibraryOptions {
  excalidrawAPI: LibraryApi;
  /** `true` lets an install URL in; without it only Excalidraw's library sites are trusted. */
  validateLibraryUrl?: (libraryUrl: string) => boolean;
  /** Where the library is kept: loaded into the editor, and every change saved back. */
  adapter?: LibraryPersistenceAdapter;
  /** A legacy store whose library moves into `adapter` on load. */
  migrationAdapter?: LibraryMigrationAdapter;
  /** The page's window, for its URL and its events. @default window */
  window?: Window;
}

/**
 * Excalidraw's `useHandleLibrary`, without a framework: installs the library
 * an `#addLibrary=` URL names (asking first unless its `token` is this
 * editor's), on load and as the hash changes; loads the library from
 * `adapter` (moving it out of `migrationAdapter` first) and saves each change
 * back. The returned function stops it.
 */
export function handleLibrary(opts: HandleLibraryOptions): () => void {
  const view = opts.window ?? window;
  const api = opts.excalidrawAPI;
  let isLibraryLoaded = false;

  async function importLibraryFromURL({ libraryUrl, idToken }: LibraryUrlTokens): Promise<void> {
    const libraryPromise = (async () => {
      const url = toValidURL(decodeURIComponent(libraryUrl));
      validateLibraryUrl(url, opts.validateLibraryUrl);
      const response = await view.fetch(url);
      return response.blob();
    })();
    const shouldPrompt = idToken !== api.id;
    // a confirmation waits for the tab to be in front
    if (shouldPrompt && view.document.hidden) {
      await new Promise<void>((resolve) => {
        view.addEventListener("focus", () => resolve(), { once: true });
      });
    }
    try {
      await api.updateLibrary({
        libraryItems: libraryPromise,
        prompt: shouldPrompt,
        merge: true,
        defaultStatus: "published",
        openLibraryMenu: true,
      });
    } catch (error) {
      api.updateScene({
        appState: { errorMessage: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      const { hash, search } = view.location;
      if (hash.includes(URL_HASH_KEYS.addLibrary)) {
        const params = new URLSearchParams(hash.slice(1));
        params.delete(URL_HASH_KEYS.addLibrary);
        view.history.replaceState({}, APP_NAME, `#${params.toString()}`);
      } else if (search.includes(URL_QUERY_KEYS.addLibrary)) {
        const query = new URLSearchParams(search);
        query.delete(URL_QUERY_KEYS.addLibrary);
        view.history.replaceState({}, APP_NAME, `?${query.toString()}`);
      }
    }
  }

  function onHashChange(event: HashChangeEvent): void {
    event.preventDefault();
    const tokens = parseLibraryTokensFromUrl(view.location);
    if (tokens) {
      event.stopImmediatePropagation();
      // the URL goes back to what it was: the install is not a navigation
      view.history.replaceState({}, "", event.oldURL);
      void importLibraryFromURL(tokens);
    }
  }

  const tokens = parseLibraryTokensFromUrl(view.location);
  if (tokens) {
    void importLibraryFromURL(tokens);
  }

  const { adapter, migrationAdapter } = opts;
  if (adapter) {
    const initData = resolvablePromise<LibraryItems | null>();
    if (migrationAdapter) {
      initData.resolve(
        promiseTry(() => migrationAdapter.load())
          .then(async (libraryData) => {
            let restoredData: LibraryItems | null = null;
            try {
              if (!libraryData) {
                return AdapterTransaction.getLibraryItems(adapter, "load");
              }
              restoredData = restoreLibraryItems(libraryData.libraryItems ?? [], "published");
              const nextItems = await persistLibraryUpdate(
                adapter,
                createLibraryUpdate([], restoredData),
              );
              try {
                await migrationAdapter.clear();
              } catch (error) {
                console.error(`couldn't delete legacy library data: ${String(error)}`);
              }
              return nextItems;
            } catch (error) {
              console.error(`couldn't migrate legacy library data: ${String(error)}`);
              return restoredData;
            }
          })
          .catch((error: unknown) => {
            console.error(`error during library migration: ${String(error)}`);
            return AdapterTransaction.getLibraryItems(adapter, "load");
          }),
      );
    } else {
      initData.resolve(promiseTry(() => AdapterTransaction.getLibraryItems(adapter, "load")));
    }
    void api
      .updateLibrary({
        libraryItems: initData.then((libraryItems) => {
          const items = libraryItems ?? [];
          lastSavedLibraryItemsHash = getLibraryItemsHash(items);
          return items;
        }),
        // what an install added before the stored library arrived stays
        merge: true,
      })
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        isLibraryLoaded = true;
      });
  }

  const offUpdate = onLibraryUpdateEmitter.on(async (update, nextLibraryItems) => {
    if (!adapter) return;
    try {
      if (lastSavedLibraryItemsHash !== getLibraryItemsHash(nextLibraryItems)) {
        await persistLibraryUpdate(adapter, update);
      }
    } catch (error) {
      console.error(`couldn't persist library update: ${String(error)}`, update);
      if (isLibraryLoaded) {
        api.updateScene({ appState: { errorMessage: { key: "errors.saveLibraryError" } } });
      }
    }
  });

  function onUnload(event: BeforeUnloadEvent): void {
    if (librarySaveCounter) {
      preventUnload(event);
    }
  }

  view.addEventListener("hashchange", onHashChange);
  view.addEventListener("beforeunload", onUnload);
  return () => {
    view.removeEventListener("hashchange", onHashChange);
    view.removeEventListener("beforeunload", onUnload);
    offUpdate();
    lastSavedLibraryItemsHash = 0;
    librarySaveCounter = 0;
  };
}
