/**
 * Actions and optimistic state — `CODESIGN.md` §3.8, `SEMANTICS.md` A4 and A5.
 *
 * An action is a LANE: an explicit transaction lifetime. While it runs, the
 * writes it makes to an opt-in primitive land in that primitive's OVERRIDE
 * buffer, leaving the authoritative buffer free for the live write the action
 * exists to trigger. Retiring the lane drops the override onto a value that is
 * already correct, so no revert target is ever stashed and there is nothing to
 * clobber (A4).
 *
 * There is no transition API and nothing is parked: a lane is opt-in per value,
 * not a second copy of the graph (A5).
 *
 * @example
 * ```ts
 * const addTodo = action(function* (text: string) {
 *   setOptimisticTodos((todos) => { todos.push({ text, pending: true }); });
 *   yield api.addTodo(text);
 *   refresh(todos);
 * });
 * ```
 */

import {
  authoritative,
  batch,
  flush,
  markInMotion,
  notePendingLane,
  overrideWrite,
  probingPending,
  readingLatest,
  retireLane,
  signal,
} from "./signals.ts";
import type { Signal, SignalOptions } from "./signals.ts";
import { type Store, unwrap, store } from "./store.ts";

interface ActionContext {
  retire: (() => void)[];
  releases: (() => void)[];
  done: boolean;
}

let activeAction: ActionContext | null = null;

function completeAction(ctx: ActionContext): void {
  if (ctx.done) return;
  ctx.done = true;
  for (let i = ctx.releases.length - 1; i >= 0; i--) {
    ctx.releases[i]();
  }
  ctx.releases.length = 0;
  batch(() => {
    retireLane(ctx);
    for (let i = ctx.retire.length - 1; i >= 0; i--) {
      ctx.retire[i]();
    }
  });
  flush();
}

function isIterator(value: unknown): value is Iterator<unknown> | AsyncIterator<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Iterator<unknown>).next === "function"
  );
}

/**
 * Wrap a function as an action. Returns an async function; optimistic
 * writes made while it runs are retired when it settles.
 *
 * - `function*` generators get full context propagation: each `yield`ed
 *   promise is awaited and the generator resumes in the action context.
 * - async functions / async generators keep the context for their
 *   synchronous segments (use generators when writes follow awaits).
 */
export function action<Args extends unknown[], R>(
  fn: (
    ...args: Args
  ) => R | Promise<R> | Generator<unknown, R, unknown> | AsyncGenerator<unknown, R, unknown>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    const ctx: ActionContext = { retire: [], releases: [], done: false };

    const runInContext = <T>(step: () => T): T => {
      const prev = activeAction;
      activeAction = ctx;
      try {
        return step();
      } finally {
        activeAction = prev;
      }
    };

    try {
      const result = runInContext(() => fn(...args));

      if (isIterator(result)) {
        const gen = result;
        let input: unknown;
        while (true) {
          const step = await runInContext(() => gen.next(input));
          if (step.done) {
            completeAction(ctx);
            return step.value;
          }
          // Awaited by the runner; the generator resumes in-context
          input = await step.value;
        }
      }

      const value = await result;
      completeAction(ctx);
      return value as R;
    } catch (err) {
      completeAction(ctx);
      throw err;
    }
  };
}

/**
 * Run `write` outside the running lane: writes it makes to optimistic values go
 * to the AUTHORITATIVE buffer, exactly as they would have outside the action.
 *
 * A generator resumes in-context, so the server's answer written after a `yield`
 * is a lane write and is discarded when the lane retires — the value reverts to
 * what it held before the action. `commit` is how an action writes the truth it
 * went to fetch; it is the write-side counterpart of `latest`, which reads the
 * same buffer.
 *
 * @example
 * ```ts
 * const rename = action(function* (id: string, name: string) {
 *   title.set(name);              // the guess, in the override buffer
 *   const saved = yield api.rename(id, name);
 *   commit(() => title.set(saved.name)); // the answer, underneath it
 * });
 * ```
 */
export function commit<T>(write: () => T): T {
  const prev = activeAction;
  activeAction = null;
  try {
    return write();
  } finally {
    activeAction = prev;
  }
}

/**
 * Declare that a derived value is in motion for the rest of the running
 * action: it reads as pending (Loading boundaries show fallbacks, `latest()`
 * keeps the last settled value) until the action settles.
 *
 * Outside an action the mark would never be released, so it is a no-op.
 */
export function affects(target: () => unknown): void {
  const ctx = activeAction;
  if (!ctx || ctx.done) return;
  ctx.releases.push(markInMotion(target));
}

/**
 * Claim the running action's layer on `layers`, once per (target, action).
 * Returns the layer to write the pending mutation into, or `null` outside an
 * action — which is the caller's signal to write the settled state instead.
 */
function claimLayer<L extends object>(
  layers: Signal<L[]>,
  owned: WeakMap<ActionContext, L>,
  make: () => L,
  onRetire?: () => void,
): L | null {
  const ctx = activeAction;
  if (!ctx || ctx.done) return null;
  const existing = owned.get(ctx);
  if (existing !== undefined) return existing;

  const layer = make();
  owned.set(ctx, layer);
  layers.update((prev) => [...prev, layer]);
  ctx.retire.push(() => {
    owned.delete(ctx);
    layers.update((prev) => prev.filter((entry) => entry !== layer));
    onRetire?.();
  });
  return layer;
}

/**
 * Optimistic signal — one node with two buffers. Writes outside an action are
 * authoritative; writes inside one go to the override buffer under that
 * action's lane. A normal read sees the override, `latest()` reads through it
 * to the authoritative value, and `isPending()` reports that an answer is
 * coming. Retiring the lane drops the override, exposing whatever the
 * authoritative buffer has become in the meantime.
 */
export function optimistic<T>(initialValue: T, options?: SignalOptions<T>): Signal<T> {
  const target = signal(initialValue, options);
  const read = (() => target()) as Signal<T>;

  const write = (patch: (prev: T) => T): void => {
    const ctx = activeAction;
    if (!ctx || ctx.done) {
      target.set(patch(authoritative(target)));
      return;
    }
    overrideWrite(target, ctx, patch);
  };

  read.set = (value: T) => write(() => value);
  read.update = (fn: (prev: T) => T) => write(fn);
  read.peek = () => target.peek();
  (read as unknown as { _node: unknown })._node = (target as unknown as { _node: unknown })._node;

  return read;
}

/**
 * Structural in-place write of `next` into `target`: the same walk that used to
 * restore a snapshot, now used to DERIVE. Keys absent from `next` are removed,
 * nested objects are recursed into so the store's per-key subscriptions see
 * only what actually changed, and arrays are truncated to length.
 */
function writeInto(target: Record<PropertyKey, unknown>, next: Record<PropertyKey, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in next)) {
      delete target[key];
    }
  }
  for (const key of Object.keys(next)) {
    const value = next[key];
    const current = target[key];
    if (
      value !== null &&
      typeof value === "object" &&
      current !== null &&
      typeof current === "object" &&
      Array.isArray(value) === Array.isArray(current)
    ) {
      writeInto(current as Record<PropertyKey, unknown>, value as Record<PropertyKey, unknown>);
      if (Array.isArray(current) && Array.isArray(value)) {
        (current as unknown[]).length = (value as unknown[]).length;
      }
    } else {
      target[key] = value;
    }
  }
}

interface StoreLayer {
  calls: unknown[][];
}

/**
 * Optimistic store — the same two buffers at whole-store arity. `base` is
 * authoritative, `view` is the override, and the lane's setter calls are how
 * the override is RECOMPUTED rather than a second place values are kept.
 * Reads are routed by mode exactly as a value's are: normal reads see the
 * override, `latest()` reads through to `base`, `isPending()` reports.
 */
export function optimisticStore<T extends object>(seed: T): Store<T> {
  const [base, setBase] = store(seed);
  const [view, setView] = store(structuredClone(unwrap(seed)));
  const layers = signal<StoreLayer[]>([]);
  const owned = new WeakMap<ActionContext, StoreLayer>();

  const buffer = (): Record<PropertyKey, unknown> =>
    (readingLatest() ? base : view) as Record<PropertyKey, unknown>;

  const routed = new Proxy({} as object, {
    get(_ignored, key) {
      if (probingPending() && layers().length > 0) notePendingLane();
      return buffer()[key];
    },
    has: (_ignored, key) => key in buffer(),
    ownKeys: () => Reflect.ownKeys(unwrap(buffer() as object)),
    getOwnPropertyDescriptor: (_ignored, key) => {
      if (!Object.hasOwn(unwrap(buffer() as object), key)) return undefined;
      return { configurable: true, enumerable: true, writable: false, value: buffer()[key] };
    },
    set: () => false,
    deleteProperty: () => false,
  }) as Store<T>[0];

  const derive = (): void => {
    const next = structuredClone(unwrap(base as unknown as T)) as unknown as Record<
      PropertyKey,
      unknown
    >;
    setView((draft) => {
      writeInto(draft as Record<PropertyKey, unknown>, next);
    });
    for (const layer of layers.peek()) {
      for (const call of layer.calls) {
        (setView as (...a: unknown[]) => void)(...call);
      }
    }
  };

  const optimisticSet = ((...args: unknown[]) => {
    const layer = claimLayer(layers, owned, () => ({ calls: [] }) as StoreLayer, derive);
    if (layer === null) {
      (setBase as (...a: unknown[]) => void)(...args);
    } else {
      layer.calls.push(args);
    }
    derive();
  }) as Store<T>[1];

  return [routed, optimisticSet];
}
