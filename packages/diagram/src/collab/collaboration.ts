import { UserIdleState, throttleRAF } from "@excalidraw/common";
import {
  getSceneVersion,
  isImageElement,
  isInitializedImageElement,
  newElementWith,
} from "@excalidraw/element";

import type { FileId, OrderedExcalidrawElement } from "@excalidraw/element/types";

import { reconcileElements } from "../data/reconcile.ts";
import { bumpElementVersions, restoreElements } from "../data/restore.ts";
import { createIdleDetector } from "../idle.ts";
import { errorMessageOf } from "../i18n.ts";
import { throttle } from "../throttle.ts";
import { getVisibleSceneBounds, zoomToFitBounds } from "../viewport.ts";
import {
  WS_SUBTYPES,
  getSyncableElements,
  isSyncableElement,
  type SocketUpdateData,
  type SocketUpdateDataIncoming,
  type SocketUpdateDataSource,
  type SyncableExcalidrawElement,
} from "./data.ts";
import {
  FILE_UPLOAD_MAX_BYTES,
  FileManager,
  decodeFileFromDownload,
  encodeFilesForUpload,
  updateStaleImageStatuses,
  type FileLoadingStatus,
} from "./files.ts";
import { createRoomCipher } from "./transport.ts";

import type { ReconciledExcalidrawElement, RemoteExcalidrawElement } from "../data/reconcile.ts";
import type { DiagramEditorApi } from "../editor/editor.ts";
import type {
  BinaryFileData,
  Collaborator,
  PointerUpdatePayload,
  SocketId,
  UserToFollow,
} from "../types.ts";
import type { ViewportStatusFrame } from "../ui/viewport-status-frame.tsx";
import type { CollabCipher, CollabTransport, StoredScene } from "./transport.ts";

const INITIAL_SCENE_UPDATE_TIMEOUT = 5000;
const FILE_UPLOAD_TIMEOUT = 300;
const LOAD_IMAGES_TIMEOUT = 500;
const SYNC_FULL_SCENE_INTERVAL_MS = 20000;
const CURSOR_SYNC_TIMEOUT = 33; // ~30fps
/** Saves that lose to a newer stored scene are reconciled and retried this many times. */
const SAVE_SCENE_ATTEMPTS = 5;

export interface CollaborationOptions {
  /** The editor: `<DiagramEditor>`'s `api`, or a headless editor's. */
  api: DiagramEditorApi;
  transport: CollabTransport;
  roomId: string;
  /** The room's AES-GCM key: nothing leaves this client unencrypted with it. */
  roomKey: string;
  username: string;
  /**
   * Joining a room someone shared, whose scene replaces this editor's;
   * otherwise the room is new and starts with this editor's scene.
   */
  existingRoom: boolean;
  /** The window idle detection and unloading are watched in. @default window */
  ownerWindow?: Window & typeof globalThis;
  /** Broadcasts the user's idle state, as `createIdleDetector` reports it. @default true */
  idleDetection?: boolean;
  /** The largest file uploaded. @default 4 MiB */
  maxFileBytes?: number;
  /** The frame shown while following someone. @default a "Following" badge in the brand's colour */
  followingFrame?: (user: UserToFollow, unfollow: () => void) => ViewportStatusFrame | null;
  /** Each file's download as it starts, ends or fails. */
  onFileStatusChange?: (updates: Array<[FileId, FileLoadingStatus]>) => void;
}

export interface CollaborationState {
  /** `"connecting"` until the transport is in the room and while it reconnects, `"closed"` once stopped. */
  status: "connecting" | "connected" | "closed";
  /** This client's id in the room. */
  socketId: SocketId | null;
  username: string;
  /** Everyone in the room, this client included, as the editor shows them. */
  collaborators: ReadonlyMap<SocketId, Collaborator>;
  /** Who this client follows: `<DiagramEditor userToFollow>`. */
  userToFollow: UserToFollow | null;
  /** Who follows this client. */
  followedBy: ReadonlySet<SocketId>;
  /** The frame to show while following: `<DiagramEditor viewportStatusFrame>`. */
  viewportStatusFrame: ViewportStatusFrame | null;
}

export interface FetchImageFilesOptions {
  elements: readonly OrderedExcalidrawElement[];
  forceFetchFiles?: boolean;
}

export interface FetchImageFilesResult {
  loadedFiles: BinaryFileData[];
  erroredFiles: Map<FileId, true>;
}

/** A live session: an editor bound to a room through a transport. */
export interface Collaboration {
  readonly roomId: string;
  readonly roomKey: string;
  /** Settles once the room's scene is in the editor: the one peers sent, the stored one, or this editor's. */
  readonly ready: Promise<void>;
  getState(): CollaborationState;
  /** Called after each change of the state, a microtask later; returns the unsubscribe. */
  subscribe(listener: (state: CollaborationState) => void): () => void;
  setUsername(username: string): void;
  /** Follows a collaborator, or stops with `null`; `onUserFollow` requests come here on their own. */
  setUserToFollow(userToFollow: UserToFollow | null): void;
  /**
   * Fetches the images the elements show whose files the room holds and this
   * client does not; with `forceFetchFiles`, also the errored and the ones
   * pending for over ten seconds.
   */
  fetchImageFiles(opts: FetchImageFilesOptions): Promise<FetchImageFilesResult>;
  /** Saves the scene to the room, uploads what is pending, and leaves. */
  stop(): Promise<void>;
}

function defaultFollowingFrame(user: UserToFollow, unfollow: () => void): ViewportStatusFrame {
  return {
    border: "var(--brand, var(--primary))",
    label: { label: `Following ${user.username}`, onClose: unfollow },
  };
}

class AbortError extends Error {
  public override name = "AbortError";
}

interface InitializeRoomOptions {
  fetchScene: boolean;
}

interface RelayBoundsOptions {
  force: boolean;
}

class CollaborationSession implements Collaboration {
  public readonly roomId: string;
  public readonly roomKey: string;
  public readonly ready: Promise<void>;

  private readonly api: DiagramEditorApi;
  private readonly transport: CollabTransport;
  private readonly cipher: CollabCipher;
  private readonly options: CollaborationOptions;
  private readonly ownerWindow: (Window & typeof globalThis) | null;
  private readonly fileManager: FileManager;
  private resolveReady!: () => void;

  private state: CollaborationState;
  private readonly listeners = new Set<(state: CollaborationState) => void>();
  private notifyScheduled = false;

  private socketId: SocketId | null = null;
  private connected = false;
  private socketInitialized = false;
  private stopped = false;
  private broadcastedElementVersions = new Map<string, number>();
  private lastBroadcastedOrReceivedSceneVersion = -1;
  private collaborators = new Map<SocketId, Collaborator>();
  private followedBy = new Set<SocketId>();
  private storedScene: StoredScene | null = null;
  private savedSceneVersion: number | null = null;
  private readonly notifiedErrors = new Set<string>();
  private socketInitializationTimer: ReturnType<typeof setTimeout> | null = null;
  private userState: UserIdleState = UserIdleState.ACTIVE;
  private readonly teardown: Array<() => void> = [];

  public constructor(options: CollaborationOptions) {
    this.options = options;
    this.api = options.api;
    this.transport = options.transport;
    this.roomId = options.roomId;
    this.roomKey = options.roomKey;
    this.cipher = createRoomCipher(options.roomKey);
    this.ownerWindow = options.ownerWindow ?? (typeof window === "undefined" ? null : window);
    this.state = {
      status: "connecting",
      socketId: null,
      username: options.username,
      collaborators: this.collaborators,
      userToFollow: null,
      followedBy: this.followedBy,
      viewportStatusFrame: null,
    };
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.fileManager = new FileManager({
      onFileStatusChange: options.onFileStatusChange,
      getFiles: async (fileIds) => {
        if (!this.connected) {
          throw new AbortError();
        }
        const { loadedFiles, erroredFiles } = await this.transport.loadFiles(fileIds);
        const errored = new Map<FileId, true>(erroredFiles.map((id) => [id, true]));
        const decoded: BinaryFileData[] = [];
        for (const file of loadedFiles) {
          try {
            decoded.push(await decodeFileFromDownload(file, this.roomKey));
          } catch (error) {
            console.error(error);
            errored.set(file.id, true);
          }
        }
        return { loadedFiles: decoded, erroredFiles: errored };
      },
      saveFiles: async ({ addedFiles }) => {
        if (!this.connected) {
          throw new AbortError();
        }
        const { savedFiles, erroredFiles } = await this.transport.saveFiles(
          await encodeFilesForUpload({
            files: addedFiles,
            encryptionKey: this.roomKey,
            maxBytes: options.maxFileBytes ?? FILE_UPLOAD_MAX_BYTES,
          }),
        );
        function pick(ids: readonly FileId[]) {
          return ids.reduce((acc: Map<FileId, BinaryFileData>, id) => {
            const fileData = addedFiles.get(id);
            if (fileData) {
              acc.set(id, fileData);
            }
            return acc;
          }, new Map());
        }
        return { savedFiles: pick(savedFiles), erroredFiles: pick(erroredFiles) };
      },
    });
    // started a task later, so a session made while a page renders writes
    // nothing during it
    queueMicrotask(() => this.start());
  }

  // ---------------------------------------------------------------------------
  // state

  public getState(): CollaborationState {
    return this.state;
  }

  public subscribe(listener: (state: CollaborationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<CollaborationState>): void {
    this.state = { ...this.state, ...patch };
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const listener of this.listeners) listener(this.state);
    });
  }

  private setErrorMessage(error: unknown, fallback: Parameters<typeof errorMessageOf>[1]): void {
    this.api.updateScene({ appState: { errorMessage: errorMessageOf(error, fallback) } });
  }

  // ---------------------------------------------------------------------------
  // lifecycle

  private start(): void {
    if (this.stopped) return;
    const { api } = this;

    if (this.options.existingRoom) {
      // when joining existing room, don't merge it with current scene data
      api.resetScene();
    } else {
      const elements = api.getSceneElements().map((element) => {
        if (isImageElement(element) && element.status === "saved") {
          return newElementWith(element, { status: "pending" });
        }
        return element;
      });
      // remove deleted elements from elements array to ensure we don't
      // expose potentially sensitive user data in case user manually deletes
      // existing elements (or clears scene), which would otherwise be persisted
      // to database even if deleted before creating the room.
      api.updateScene({ elements, captureUpdate: "NEVER" });
    }

    this.teardown.push(
      api.onChange((elements) => this.syncElements(elements)),
      api.onPointerUpdate((payload) => this.onPointerUpdate(payload)),
      api.onUserFollow((payload) =>
        this.setUserToFollow(payload.action === "FOLLOW" ? payload.userToFollow : null),
      ),
    );
    const ownerWindow = this.ownerWindow;
    const relayBounds = ownerWindow
      ? throttleRAF(() => this.relayVisibleSceneBounds(), ownerWindow)
      : null;
    this.teardown.push(
      api.onScrollChange(() => (relayBounds ? relayBounds() : this.relayVisibleSceneBounds())),
    );
    if (relayBounds) this.teardown.push(() => relayBounds.cancel());

    if (ownerWindow) {
      const beforeUnload = (event: BeforeUnloadEvent) => this.beforeUnload(event);
      const pageHide = () => this.transport.close();
      ownerWindow.addEventListener("beforeunload", beforeUnload);
      ownerWindow.addEventListener("pagehide", pageHide);
      this.teardown.push(() => {
        ownerWindow.removeEventListener("beforeunload", beforeUnload);
        ownerWindow.removeEventListener("pagehide", pageHide);
      });
      if (this.options.idleDetection !== false) {
        this.teardown.push(
          createIdleDetector({
            ownerWindow,
            onChange: (userState) => void this.broadcastIdleChange(userState),
          }),
        );
      }
    }

    // fallback in case you're not alone in the room but still don't receive
    // initial SCENE_INIT message
    this.socketInitializationTimer = setTimeout(
      () => void this.initializeRoom({ fetchScene: true }),
      INITIAL_SCENE_UPDATE_TIMEOUT,
    );

    this.transport.connect(
      { roomId: this.roomId, cipher: this.cipher },
      {
        onConnect: (socketId) => {
          const reconnected = this.socketInitialized;
          this.socketId = socketId;
          this.connected = true;
          this.setState({ status: "connected", socketId });
          if (reconnected) {
            // back under a new id: the room hears this client's scene and
            // who it follows again, and what was missed comes as INIT
            const { userToFollow } = this.state;
            if (userToFollow) this.transport.follow({ userToFollow, action: "FOLLOW" });
            void this.broadcastScene(
              WS_SUBTYPES.UPDATE,
              this.api.getSceneElementsIncludingDeleted(),
              true,
            );
            void this.broadcastIdleChange(this.userState);
          }
        },
        onFirstInRoom: () => void this.initializeRoom({ fetchScene: true }),
        onNewUser: () => {
          void this.broadcastScene(
            WS_SUBTYPES.INIT,
            this.api.getSceneElementsIncludingDeleted(),
            /* syncAll */ true,
          );
          // who this is, before the pointer moves
          void this.broadcastIdleChange(this.userState);
        },
        onRoomUserChange: (socketIds) => this.setCollaborators(socketIds),
        onMessage: (data) => this.onMessage(data),
        onFollowersChange: (socketIds) => {
          this.followedBy = new Set(socketIds);
          this.setState({ followedBy: this.followedBy });
          this.relayVisibleSceneBounds({ force: true });
        },
        onDisconnect: (error) => {
          this.connected = false;
          if (error) console.error(error);
          if (!this.socketInitialized) {
            void this.initializeRoom({ fetchScene: false });
          }
          this.followedBy = new Set();
          this.setState({ status: "connecting", followedBy: this.followedBy });
        },
      },
    );
  }

  public async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.queueBroadcastAllElements.cancel();
    this.queueSaveToRoom.cancel();
    this.loadImageFiles.cancel();
    this.clearInitializationTimer();
    for (const off of this.teardown.splice(0)) off();

    // an editor gone first has nothing left to save or hand back
    if (this.connected && !this.api.isDestroyed) {
      await this.saveCollabRoom(getSyncableElements(this.api.getSceneElementsIncludingDeleted()));
      this.queueFileUpload.flush();
      await this.pendingUpload;
    }
    this.queueFileUpload.cancel();
    this.transport.close();
    this.connected = false;
    this.socketInitialized = false;
    this.lastBroadcastedOrReceivedSceneVersion = -1;
    this.broadcastedElementVersions = new Map();
    this.fileManager.reset();
    this.followedBy = new Set();
    this.collaborators = new Map();

    if (!this.api.isDestroyed) {
      const elements = this.api.getSceneElementsIncludingDeleted().map((element) => {
        if (isImageElement(element) && element.status === "saved") {
          return newElementWith(element, { status: "pending" });
        }
        return element;
      });
      this.api.updateScene({
        elements,
        collaborators: this.collaborators,
        captureUpdate: "NEVER",
      });
    }
    this.setState({
      status: "closed",
      collaborators: this.collaborators,
      followedBy: this.followedBy,
      userToFollow: null,
      viewportStatusFrame: null,
    });
    this.resolveReady();
  }

  private clearInitializationTimer(): void {
    if (this.socketInitializationTimer !== null) {
      clearTimeout(this.socketInitializationTimer);
      this.socketInitializationTimer = null;
    }
  }

  private beforeUnload(event: BeforeUnloadEvent): void {
    const syncableElements = getSyncableElements(this.api.getSceneElementsIncludingDeleted());
    if (
      this.connected &&
      (this.fileManager.shouldPreventUnload(syncableElements) || !this.isSaved(syncableElements))
    ) {
      // this won't run in time if user decides to leave the site, but
      //  the purpose is to run in immediately after user decides to stay
      void this.saveCollabRoom(syncableElements);
      event.preventDefault();
      event.returnValue = "";
    }
  }

  private async initializeRoom({ fetchScene }: InitializeRoomOptions): Promise<void> {
    this.clearInitializationTimer();
    if (this.socketInitialized || this.stopped) return;
    this.socketInitialized = true;
    try {
      if (fetchScene && this.options.existingRoom && this.connected) {
        await this.loadStoredScene();
      } else if (fetchScene && !this.options.existingRoom) {
        // a new room starts with this editor's scene, kept and sent in full
        const elements = this.api.getSceneElementsIncludingDeleted();
        await this.broadcastScene(WS_SUBTYPES.UPDATE, elements, true);
        await this.saveCollabRoom(getSyncableElements(elements));
      }
    } catch (error) {
      // log the error and move on. other peers will sync us the scene.
      console.error(error);
    } finally {
      void this.broadcastIdleChange(this.userState);
      this.resolveReady();
    }
  }

  // ---------------------------------------------------------------------------
  // incoming

  private onMessage(decryptedData: SocketUpdateDataIncoming): void {
    if (this.stopped) return;
    switch (decryptedData.type) {
      case WS_SUBTYPES.INVALID_RESPONSE:
        this.setErrorMessage(null, { key: "alerts.decryptFailed" });
        return;
      case WS_SUBTYPES.INIT: {
        const first = !this.socketInitialized;
        if (first) {
          void this.initializeRoom({ fetchScene: false });
        }
        // the whole scene, reconciled like any update: on a reconnection,
        // what this client missed while it was away
        this.handleRemoteSceneUpdate(
          this._reconcileElements(
            decryptedData.payload.elements as readonly RemoteExcalidrawElement[],
          ),
        );
        if (first) {
          this.api.scrollToContent(this.api.getSceneElements());
        }
        break;
      }
      case WS_SUBTYPES.UPDATE:
        this.handleRemoteSceneUpdate(
          this._reconcileElements(
            decryptedData.payload.elements as readonly RemoteExcalidrawElement[],
          ),
        );
        break;
      case WS_SUBTYPES.MOUSE_LOCATION: {
        const { pointer, button, username, selectedElementIds, socketId } = decryptedData.payload;
        this.updateCollaborator(socketId, {
          pointer,
          button,
          selectedElementIds,
          username,
        });
        break;
      }
      case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS: {
        const { sceneBounds, socketId } = decryptedData.payload;
        const { userToFollow } = this.state;

        // we're not following the user
        // (shouldn't happen, but could be late message or bug upstream)
        if (userToFollow?.socketId !== socketId) {
          console.warn(
            `receiving remote client's (from ${socketId}) viewport bounds even though we're not subscribed to it!`,
          );
          return;
        }

        // cross-follow case, ignore updates in this case
        if (this.followedBy.has(userToFollow.socketId)) {
          return;
        }

        this.api.updateScene({
          appState: zoomToFitBounds({
            appState: this.api.getAppState(),
            bounds: sceneBounds,
            fit: "contain",
          }).appState,
        });
        break;
      }
      case WS_SUBTYPES.IDLE_STATUS: {
        const { userState, socketId, username } = decryptedData.payload;
        this.updateCollaborator(socketId, { userState, username });
        break;
      }
    }
  }

  private _reconcileElements(
    remoteElements: readonly RemoteExcalidrawElement[],
  ): ReconciledExcalidrawElement[] {
    const appState = this.api.getAppState();
    const existingElements = this.api.getSceneElementsIncludingDeleted();

    // NOTE ideally we restore _after_ reconciliation but we can't do that
    // as we'd regenerate even elements such as appState.newElement which would
    // break the state
    const restoredElements = restoreElements(
      remoteElements,
      existingElements,
    ) as readonly RemoteExcalidrawElement[];

    const reconciledElements = bumpElementVersions<ReconciledExcalidrawElement>(
      reconcileElements(existingElements, restoredElements, appState),
      existingElements,
    );

    // Avoid broadcasting to the rest of the collaborators the scene
    // we just received!
    // Note: this needs to be set before updating the scene as it
    // synchronously calls render.
    this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(reconciledElements);

    return reconciledElements;
  }

  private handleRemoteSceneUpdate(elements: readonly ReconciledExcalidrawElement[]): void {
    this.api.updateScene({ elements, captureUpdate: "NEVER" });
    this.loadImageFiles();
  }

  private readonly loadImageFiles = throttle(async () => {
    const { loadedFiles, erroredFiles } = await this.fetchImageFiles({
      elements: this.api.getSceneElementsIncludingDeleted(),
    });
    if (this.stopped) return;
    this.api.addFiles(loadedFiles);
    updateStaleImageStatuses({ api: this.api, erroredFiles });
  }, LOAD_IMAGES_TIMEOUT);

  public async fetchImageFiles(opts: FetchImageFilesOptions): Promise<FetchImageFilesResult> {
    const unfetchedImages = opts.elements
      .filter(isInitializedImageElement)
      .filter(
        (element) =>
          !this.fileManager.isFileTracked(element.fileId) &&
          !element.isDeleted &&
          (opts.forceFetchFiles
            ? element.status !== "pending" || Date.now() - element.updated > 10000
            : element.status === "saved"),
      )
      .map((element) => element.fileId);

    try {
      return await this.fileManager.getFiles(unfetchedImages);
    } catch (error) {
      if (!(error instanceof AbortError)) console.error(error);
      return { loadedFiles: [], erroredFiles: new Map() };
    }
  }

  private setCollaborators(sockets: readonly SocketId[]): void {
    const collaborators = new Map<SocketId, Collaborator>();
    for (const socketId of sockets) {
      const isCurrentUser = socketId === this.socketId;
      collaborators.set(
        socketId,
        Object.assign(
          // we never receive our own broadcasts, so we need to seed
          // our own collaborator entry with the local username
          isCurrentUser ? { username: this.state.username } : {},
          this.collaborators.get(socketId),
          { isCurrentUser },
        ),
      );
    }
    this.collaborators = collaborators;
    this.api.updateScene({ collaborators });
    this.setState({ collaborators });

    // unfollow if the followed user left the room
    const { userToFollow } = this.state;
    if (userToFollow && !collaborators.has(userToFollow.socketId)) {
      this.setUserToFollow(null);
    }
  }

  private updateCollaborator(socketId: SocketId, updates: Partial<Collaborator>): void {
    const isCurrentUser = socketId === this.socketId;
    const collaborators = new Map(this.collaborators);
    const user: Collaborator = Object.assign(
      // we never receive our own broadcasts, so we need to seed
      // our own collaborator entry with the local username
      isCurrentUser ? { username: this.state.username } : {},
      collaborators.get(socketId),
      updates,
      { isCurrentUser },
    );
    collaborators.set(socketId, user);
    this.collaborators = collaborators;
    this.api.updateScene({ collaborators });
    this.setState({ collaborators });
  }

  // ---------------------------------------------------------------------------
  // outgoing

  private isOpen(): boolean {
    return this.socketInitialized && this.connected && !this.stopped;
  }

  private async broadcastSocketData(data: SocketUpdateData, volatile = false): Promise<void> {
    if (this.isOpen()) {
      try {
        await this.transport.broadcast(data, { volatile });
      } catch (error) {
        console.error(error);
      }
    }
  }

  private readonly broadcastScene = async (
    updateType: typeof WS_SUBTYPES.INIT | typeof WS_SUBTYPES.UPDATE,
    elements: readonly OrderedExcalidrawElement[],
    syncAll: boolean,
  ): Promise<void> => {
    // sync out only the elements we think we need to to save bandwidth.
    // periodically we'll resync the whole thing to make sure no one diverges
    // due to a dropped message (server goes down etc).
    const syncableElements = elements.reduce((acc, element) => {
      if (
        (syncAll ||
          !this.broadcastedElementVersions.has(element.id) ||
          element.version > (this.broadcastedElementVersions.get(element.id) ?? -1)) &&
        isSyncableElement(element)
      ) {
        acc.push(element);
      }
      return acc;
    }, [] as SyncableExcalidrawElement[]);

    const data: SocketUpdateData = {
      type: updateType,
      payload: {
        elements: syncableElements,
      },
    };

    for (const syncableElement of syncableElements) {
      this.broadcastedElementVersions.set(syncableElement.id, syncableElement.version);
    }

    this.queueFileUpload();

    await this.broadcastSocketData(data);
  };

  private pendingUpload: Promise<void> = Promise.resolve();

  private readonly queueFileUpload = throttle(() => {
    this.pendingUpload = this.uploadFiles();
    return this.pendingUpload;
  }, FILE_UPLOAD_TIMEOUT);

  private async uploadFiles(): Promise<void> {
    try {
      await this.fileManager.saveFiles({
        elements: this.api.getSceneElementsIncludingDeleted(),
        files: this.api.getFiles(),
      });
    } catch (error) {
      if (!(error instanceof AbortError)) {
        this.setErrorMessage(error, { key: "errors.imageInsertError" });
      }
    }

    let isChanged = false;
    const newElements = this.api.getSceneElementsIncludingDeleted().map((element) => {
      if (this.fileManager.shouldUpdateImageElementStatus(element)) {
        isChanged = true;
        // this will signal collaborators to pull image data from server
        return newElementWith(element, { status: "saved" });
      }
      return element;
    });

    if (isChanged) {
      this.api.updateScene({
        elements: newElements,
        captureUpdate: "NEVER",
      });
    }
  }

  private broadcastIdleChange(userState: UserIdleState): Promise<void> | undefined {
    this.userState = userState;
    if (this.socketId) {
      const data: SocketUpdateDataSource["IDLE_STATUS"] = {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: this.socketId,
          userState,
          username: this.state.username,
        },
      };
      return this.broadcastSocketData(data, true);
    }
    return undefined;
  }

  private readonly broadcastMouseLocation = throttle(
    (payload: Pick<PointerUpdatePayload, "pointer" | "button">) => {
      if (this.socketId) {
        const data: SocketUpdateDataSource["MOUSE_LOCATION"] = {
          type: WS_SUBTYPES.MOUSE_LOCATION,
          payload: {
            socketId: this.socketId,
            pointer: payload.pointer,
            button: payload.button || "up",
            selectedElementIds: this.api.getAppState().selectedElementIds,
            username: this.state.username,
          },
        };
        return this.broadcastSocketData(data, true);
      }
      return undefined;
    },
    CURSOR_SYNC_TIMEOUT,
  );

  private onPointerUpdate(payload: PointerUpdatePayload): void {
    // the editor's live map of pointers down: a pinch is not a cursor
    if (payload.pointersMap.size < 2) {
      this.broadcastMouseLocation({ pointer: { ...payload.pointer }, button: payload.button });
    }
  }

  private relayVisibleSceneBounds(props?: RelayBoundsOptions): void {
    if (this.socketId && (this.followedBy.size > 0 || props?.force)) {
      const data: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"] = {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
        payload: {
          socketId: this.socketId,
          username: this.state.username,
          sceneBounds: getVisibleSceneBounds(this.api.getAppState()),
        },
      };
      void this.broadcastSocketData(data, true);
    }
  }

  private broadcastElements(elements: readonly OrderedExcalidrawElement[]): void {
    if (getSceneVersion(elements) > this.lastBroadcastedOrReceivedSceneVersion) {
      void this.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
      this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(elements);
      this.queueBroadcastAllElements();
    }
  }

  private syncElements(elements: readonly OrderedExcalidrawElement[]): void {
    if (this.stopped) return;
    this.broadcastElements(elements);
    this.queueSaveToRoom();
  }

  private readonly queueBroadcastAllElements = throttle(() => {
    void this.broadcastScene(WS_SUBTYPES.UPDATE, this.api.getSceneElementsIncludingDeleted(), true);
    this.lastBroadcastedOrReceivedSceneVersion = Math.max(
      this.lastBroadcastedOrReceivedSceneVersion,
      getSceneVersion(this.api.getSceneElementsIncludingDeleted()),
    );
  }, SYNC_FULL_SCENE_INTERVAL_MS);

  private readonly queueSaveToRoom = throttle(
    () => {
      if (this.socketInitialized) {
        void this.saveCollabRoom(getSyncableElements(this.api.getSceneElementsIncludingDeleted()));
      }
    },
    SYNC_FULL_SCENE_INTERVAL_MS,
    { leading: false },
  );

  // ---------------------------------------------------------------------------
  // the stored scene

  private isSaved(elements: readonly SyncableExcalidrawElement[]): boolean {
    // with nowhere to store the scene, there is nothing to wait for
    return !this.transport.saveScene || this.savedSceneVersion === getSceneVersion(elements);
  }

  private async openStoredScene(scene: StoredScene): Promise<SyncableExcalidrawElement[]> {
    const elements = await this.cipher.decrypt(scene.data);
    if (!Array.isArray(elements)) {
      throw new Error("the room's stored scene is not a list of elements");
    }
    return getSyncableElements(
      restoreElements(elements as OrderedExcalidrawElement[], null, {
        deleteInvisibleElements: true,
      }),
    );
  }

  private async loadStoredScene(): Promise<void> {
    if (!this.transport.loadScene) return;
    const stored = await this.transport.loadScene();
    if (!stored || this.stopped) return;
    this.storedScene = stored;
    const elements = await this.openStoredScene(stored);
    this.savedSceneVersion = getSceneVersion(elements);
    // what peers sent meanwhile is reconciled into what was stored
    const reconciled = reconcileElements(
      elements,
      this.api.getSceneElementsIncludingDeleted() as readonly RemoteExcalidrawElement[],
      this.api.getAppState(),
    );
    this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(reconciled);
    this.api.updateScene({ elements: reconciled, captureUpdate: "NEVER" });
    this.api.scrollToContent(this.api.getSceneElements());
    const { loadedFiles, erroredFiles } = await this.fetchImageFiles({
      elements: reconciled,
      forceFetchFiles: true,
    });
    this.api.addFiles(loadedFiles);
    updateStaleImageStatuses({ api: this.api, erroredFiles });
  }

  private async saveCollabRoom(
    syncableElements: readonly SyncableExcalidrawElement[],
  ): Promise<void> {
    const { transport } = this;
    if (!transport.saveScene || !this.connected || this.isSaved(syncableElements)) {
      return;
    }
    try {
      let base = this.storedScene;
      for (let attempt = 0; attempt < SAVE_SCENE_ATTEMPTS; attempt++) {
        const elements = base
          ? getSyncableElements(
              reconcileElements(
                syncableElements,
                (await this.openStoredScene(
                  base,
                )) as readonly OrderedExcalidrawElement[] as readonly RemoteExcalidrawElement[],
                this.api.getAppState(),
              ),
            )
          : syncableElements;
        const data = await this.cipher.encrypt(elements);
        const result = await transport.saveScene?.({
          revision: base?.revision ?? 0,
          data,
        });
        if (!result) return;
        if (result.saved) {
          this.storedScene = { revision: result.revision, data };
          this.savedSceneVersion = getSceneVersion(elements);
          if (this.isOpen()) {
            this.handleRemoteSceneUpdate(
              this._reconcileElements(
                elements as readonly OrderedExcalidrawElement[] as readonly RemoteExcalidrawElement[],
              ),
            );
          }
          return;
        }
        base = result.current;
        this.storedScene = base;
      }
      throw new Error("the room's scene kept changing while it was saved");
    } catch (error) {
      console.error(error);
      const tooBig = error instanceof Error && /too (big|large)/i.test(error.message);
      const key = tooBig ? "errors.collabSaveFailed_sizeExceeded" : "errors.collabSaveFailed";
      if (!this.notifiedErrors.has(key)) {
        this.notifiedErrors.add(key);
        this.setErrorMessage(null, { key });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // following and the user

  public setUserToFollow(userToFollow: UserToFollow | null): void {
    const prev = this.state.userToFollow;

    if (prev?.socketId !== userToFollow?.socketId && this.connected) {
      // leave the previous user's follow room before joining the next one
      if (prev) {
        this.transport.follow({ userToFollow: prev, action: "UNFOLLOW" });
      }
      if (userToFollow) {
        this.transport.follow({ userToFollow, action: "FOLLOW" });
      }
    }

    const frame = this.options.followingFrame ?? defaultFollowingFrame;
    this.setState({
      userToFollow,
      viewportStatusFrame: userToFollow
        ? frame(userToFollow, () => this.setUserToFollow(null))
        : null,
    });
  }

  public setUsername(username: string): void {
    this.setState({ username });
    // keep our own collaborator entry in sync
    if (this.socketId && this.collaborators.has(this.socketId)) {
      this.updateCollaborator(this.socketId, { username });
    }
    void this.broadcastIdleChange(this.userState);
  }
}

/**
 * Binds an editor to a room, as excalidraw.com's `Collab` does: the scene
 * in increments with a full sync every twenty seconds, reconciled on
 * arrival; cursors, laser trails, selections and idle states; following
 * and the followed side's viewport; images uploaded and fetched; the scene
 * stored for whoever joins an empty room. Everything leaves encrypted with
 * the room key.
 */
export function createCollaboration(options: CollaborationOptions): Collaboration {
  return new CollaborationSession(options);
}
