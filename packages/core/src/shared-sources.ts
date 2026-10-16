/**
 * The async sources one live connection reads, shared across every render it
 * makes.
 *
 * A live frame is rendered again each time something it reads moves, and each
 * render declares its memos afresh. A generator yields to one reader, so a
 * second render reading the same source would compete with the first for its
 * values. Every read goes through a seat here instead: one pump per source,
 * its latest value handed to a new seat at once, so a render after the first
 * reads where the source stands, and a value that arrives tells the
 * connection to render again.
 */

interface Source {
  readonly iterator: AsyncIterator<unknown>;
  latest: unknown;
  /** How many values it has yielded; a seat that has read fewer is owed the latest. */
  version: number;
  done: boolean;
  failure: { readonly error: unknown } | null;
  readonly waiting: Set<() => void>;
}

export class SharedSources {
  private readonly sources = new Map<AsyncIterable<unknown>, Source>();
  /** The sources seated since the last sweep. */
  private seated = new Set<Source>();
  private listener: (() => void) | null = null;
  private scheduled = false;
  private closed = false;

  /** Called, once per turn, after a source has yielded a value past its first or ended. */
  onChange(listener: () => void): void {
    this.listener = listener;
  }

  /** Whether every source seated in the last render has ended. */
  get settled(): boolean {
    for (const source of this.seated) if (!source.done) return false;
    return true;
  }

  /** A reader of `iterable`'s values, starting from the one it last yielded. */
  seat<T>(iterable: AsyncIterable<T>): AsyncIterable<T> {
    let source = this.sources.get(iterable);
    if (source === undefined) {
      source = {
        iterator: iterable[Symbol.asyncIterator](),
        latest: undefined,
        version: 0,
        done: false,
        failure: null,
        waiting: new Set(),
      };
      this.sources.set(iterable, source);
      void this.pump(source);
    }
    this.seated.add(source);
    const held = source;
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<T> => {
        let read = 0;
        let wake: (() => void) | null = null;
        const step = (): IteratorResult<T> | null => {
          if (held.failure !== null) throw held.failure.error;
          if (read < held.version) {
            read = held.version;
            return { done: false, value: held.latest as T };
          }
          return held.done ? { done: true, value: undefined } : null;
        };
        return {
          next: () => {
            // A value already here is answered as a bare result, which the
            // engine takes as a step that has settled: the render reads it in
            // the same turn rather than suspending on it.
            let now: IteratorResult<T> | null;
            try {
              now = step();
            } catch (error) {
              return Promise.reject(error);
            }
            if (now !== null) return now as unknown as Promise<IteratorResult<T>>;
            return new Promise<IteratorResult<T>>((resolve, reject) => {
              wake = () => {
                held.waiting.delete(wake!);
                try {
                  const later = step();
                  if (later !== null) resolve(later);
                  else held.waiting.add(wake!);
                } catch (error) {
                  reject(error);
                }
              };
              held.waiting.add(wake);
            });
          },
          return: () => {
            if (wake !== null) held.waiting.delete(wake);
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  private async pump(source: Source): Promise<void> {
    try {
      for (;;) {
        const step = await source.iterator.next();
        if (this.closed) return;
        if (step.done === true) break;
        source.latest = step.value;
        source.version++;
        this.wake(source);
        if (source.version > 1) this.changed();
      }
    } catch (error) {
      if (this.closed) return;
      source.failure = { error };
    }
    source.done = true;
    this.wake(source);
    this.changed();
  }

  private wake(source: Source): void {
    // Taken first: a seat with nothing for it yet puts itself back.
    const now = Array.from(source.waiting);
    for (const waiting of now) waiting();
  }

  private changed(): void {
    if (this.scheduled || this.closed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.closed) this.listener?.();
    });
  }

  /**
   * Close every source the last render did not read: one a render created for
   * itself, which the next render replaced with its own.
   */
  sweep(): void {
    for (const [iterable, source] of this.sources) {
      if (this.seated.has(source)) continue;
      this.sources.delete(iterable);
      void source.iterator.return?.();
    }
  }

  /** Start a render: what it seats is what the next sweep keeps. */
  begin(): void {
    this.seated = new Set();
  }

  /** The connection has ended: every source is told to stop. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const source of this.sources.values()) void source.iterator.return?.();
    this.sources.clear();
  }
}

/**
 * Which renders read through which connection's seats. On the global under a
 * registered symbol: the server bundle and the package entry a host imports
 * each carry a copy of this module, and the connection is opened through one
 * while the render declares its memos through the other.
 */
const REGISTRY: Map<symbol, SharedSources> = ((
  globalThis as { [key: symbol]: Map<symbol, SharedSources> | undefined }
)[Symbol.for("barq.shared-sources")] ??= new Map());

/** Read every async source a render under `session` declares through `shared`. */
export function shareSources(session: symbol, shared: SharedSources): void {
  REGISTRY.set(session, shared);
}

export function unshareSources(session: symbol): void {
  REGISTRY.delete(session);
}

export function sharedSourcesOf(session: symbol | null): SharedSources | undefined {
  return session === null ? undefined : REGISTRY.get(session);
}
