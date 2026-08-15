/**
 * Actions and optimistic state — `CODESIGN.md` §3.8, `SEMANTICS.md` A4.
 *
 * An action is a lifetime: while it runs, the writes made to an optimistic
 * primitive inside it are PENDING MUTATIONS, and the value everyone reads is
 * `reduce(settled, pending)`. Retiring the action drops its layer and the
 * derivation falls back to the settled state on its own.
 *
 * There is no snapshot. The previous implementation captured `revertTo` once
 * per (target, action) and wrote it back at completion, so a real write landing
 * during the action — the refresh the action exists to trigger — was rolled
 * back to a value that was by then wrong, and `createOptimisticStore` paid a
 * whole-store `structuredClone` to do it. With nothing captured there is
 * nothing to clobber (A4).
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

import { batch, computed, flush, markInMotion, signal } from "./signals.ts";
import type { Signal, SignalOptions } from "./signals.ts";
import { type Store, unwrap, useStore } from "./store.ts";

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
  if (ctx.retire.length > 0) {
    batch(() => {
      for (let i = ctx.retire.length - 1; i >= 0; i--) {
        ctx.retire[i]();
      }
    });
  }
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

interface ValueLayer<T> {
  patch: (settled: T) => T;
}

/**
 * Optimistic signal. Writes outside an action are the settled state; writes
 * inside one are a pending mutation layered over it, and the read is
 * `reduce(settled, pending)`. When the action retires, the layer goes and the
 * settled state — including anything that landed on it mid-flight — is what
 * remains.
 */
export function createOptimistic<T>(initialValue: T, options?: SignalOptions<T>): Signal<T> {
  const settled = signal(initialValue, options);
  const layers = signal<ValueLayer<T>[]>([]);
  const owned = new WeakMap<ActionContext, ValueLayer<T>>();

  const view = computed<T>(() => {
    const pending = layers();
    let value = settled();
    for (let i = 0; i < pending.length; i++) value = pending[i].patch(value);
    return value;
  }, options);

  const read = (() => view()) as Signal<T>;

  const write = (patch: (prev: T) => T): void => {
    const layer = claimLayer(layers, owned, () => ({ patch }) as ValueLayer<T>);
    if (layer === null) {
      settled.set(patch(settled.peek()));
      return;
    }
    layer.patch = patch;
    layers.update((prev) => [...prev]);
  };

  read.set = (value: T) => write(() => value);
  read.update = (fn: (prev: T) => T) => write(fn);
  read.peek = () => view.peek();

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
 * Optimistic store. The returned store is a PROJECTION of a private settled
 * store with the running action's setter calls replayed on top; retiring the
 * action re-derives without them. No snapshot of the settled store is ever
 * taken, so a real write landing mid-action survives.
 */
export function createOptimisticStore<T extends object>(seed: T): Store<T> {
  const [base, setBase] = useStore(seed);
  const [view, setView] = useStore(structuredClone(unwrap(seed)));
  const layers = signal<StoreLayer[]>([]);
  const owned = new WeakMap<ActionContext, StoreLayer>();

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

  return [view, optimisticSet];
}
