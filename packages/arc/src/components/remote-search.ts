import { type Scheduled, debounce } from "@barqjs/primitives/scheduled";

/** A page of what a search found, with what asks for the next one. */
export interface RemotePage<T> {
  results: readonly T[];
  /** Handed back to the search for the page after; none on the last page. */
  next?: unknown;
}

export interface RemoteSearchContext {
  /** Aborted when the text changes, or the search is stopped. */
  signal: AbortSignal;
  /** The `next` of the page before, for every page but the first. */
  cursor?: unknown;
}

export type RemoteSearchFn<T> = (
  query: string,
  context: RemoteSearchContext,
) => Promise<RemotePage<T> | readonly T[]>;

export interface RemoteState<T> {
  /** `idle` while the text is shorter than the search needs. */
  status: "idle" | "loading" | "done" | "error";
  results: readonly T[];
  next?: unknown;
  loadingMore: boolean;
}

export interface RemoteSearchOptions<T> {
  /** Read when each request goes out, so the latest function is the one called. */
  search: () => RemoteSearchFn<T>;
  /** @default 250 */
  debounce?: number;
  /** @default 0 */
  minLength?: number;
  /** Every change of state, from a handler or a settled request: write it to a signal. */
  onChange: (state: RemoteState<T>) => void;
}

export interface RemoteSearch {
  /** Search for `text` once typing pauses, aborting the request it replaces. */
  query: (text: string) => void;
  /** Ask for the page after the last, adding it to the results. */
  more: () => void;
  /** Abort what is out and drop what is waiting. */
  stop: () => void;
}

const IDLE = { status: "idle", results: [], loadingMore: false } as const;

/**
 * A search a server answers, as a palette or a picker runs it: debounced,
 * the request it replaces aborted and its late answer dropped, paged by a
 * cursor. It holds no signal of its own; the caller writes `onChange`'s state
 * into one, which keeps the writes in handlers and promise callbacks.
 */
export function remoteSearch<T>(options: RemoteSearchOptions<T>): RemoteSearch {
  let state: RemoteState<T> = IDLE;
  let typed = "";
  let controller: AbortController | undefined;

  const set = (next: RemoteState<T>): void => {
    state = next;
    options.onChange(next);
  };

  const fetchPage = (text: string, cursor?: unknown): void => {
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const before = cursor === undefined ? [] : state.results;
    options
      .search()(text, { signal: own.signal, cursor })
      .then(
        (page) => {
          if (own.signal.aborted) return;
          const results = "results" in page ? page.results : page;
          const next = "results" in page ? page.next : undefined;
          set({ status: "done", results: [...before, ...results], next, loadingMore: false });
        },
        () => {
          if (own.signal.aborted) return;
          set({ status: "error", results: before, loadingMore: false });
        },
      );
  };

  const waiting: Scheduled<[string]> = debounce(
    (text: string) => fetchPage(text),
    options.debounce ?? 250,
  );

  const stop = (): void => {
    controller?.abort();
    controller = undefined;
    waiting.clear();
  };

  return {
    query(text) {
      typed = text;
      stop();
      if (text.trim().length < (options.minLength ?? 0)) {
        set(IDLE);
        return;
      }
      set({ status: "loading", results: [], loadingMore: false });
      waiting(text);
    },
    more() {
      if (state.next === undefined || state.loadingMore || state.status !== "done") return;
      set({ ...state, loadingMore: true });
      fetchPage(typed, state.next);
    },
    stop,
  };
}
