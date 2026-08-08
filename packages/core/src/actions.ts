/**
 * Actions & optimistic updates (Solid 2.0)
 *
 * Actions run async work inside a transient context. Writes to optimistic
 * primitives made while an action is active are reverted when the action
 * completes (success or failure) - by then the real source of truth has
 * been refreshed, so the optimistic value is no longer needed.
 *
 * Generator actions get exact resumption semantics: `yield promise` is
 * awaited by the runner and the generator resumes inside the same action
 * context, so optimistic writes after a yield still register.
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

import { batch, flush } from "./signals.ts";
import type { Signal, SignalOptions } from "./signals.ts";
import { markInMotion, signal } from "./signals.ts";
import { type Store, unwrap, useStore } from "./store.ts";

interface ActionContext {
  reverts: (() => void)[];
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
  if (ctx.reverts.length > 0) {
    batch(() => {
      for (let i = ctx.reverts.length - 1; i >= 0; i--) {
        ctx.reverts[i]();
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
 * writes made while it runs revert when it settles.
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
    const ctx: ActionContext = { reverts: [], releases: [], done: false };

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

/** Register a revert with the active action, once per (target, action) */
function registerRevert(registered: WeakSet<ActionContext>, makeRevert: () => () => void): void {
  const ctx = activeAction;
  if (!ctx || ctx.done || registered.has(ctx)) return;
  registered.add(ctx);
  ctx.reverts.push(makeRevert());
}

/**
 * Optimistic signal: writes made while an action is running revert to the
 * pre-action value when the action completes. Writes outside an action
 * update the base value normally.
 */
export function createOptimistic<T>(initialValue: T, options?: SignalOptions<T>): Signal<T> {
  const inner = signal(initialValue, options);
  let base = initialValue;
  const registered = new WeakSet<ActionContext>();

  const read = (() => inner()) as Signal<T>;

  read.set = (value: T) => {
    if (activeAction && !activeAction.done) {
      registerRevert(registered, () => {
        const revertTo = base;
        return () => inner.set(revertTo);
      });
    } else {
      base = value;
    }
    inner.set(value);
  };
  read.update = (fn: (prev: T) => T) => read.set(fn(inner.peek()));
  read.peek = () => inner.peek();

  return read;
}

function restoreSnapshot(
  target: Record<PropertyKey, unknown>,
  snap: Record<PropertyKey, unknown>,
): void {
  for (const key of Object.keys(target)) {
    if (!(key in snap)) {
      delete target[key];
    }
  }
  for (const key of Object.keys(snap)) {
    const value = snap[key];
    const current = target[key];
    if (
      value !== null &&
      typeof value === "object" &&
      current !== null &&
      typeof current === "object" &&
      Array.isArray(value) === Array.isArray(current)
    ) {
      restoreSnapshot(
        current as Record<PropertyKey, unknown>,
        value as Record<PropertyKey, unknown>,
      );
      if (Array.isArray(current) && Array.isArray(value)) {
        (current as unknown[]).length = (value as unknown[]).length;
      }
    } else {
      target[key] = value;
    }
  }
}

/**
 * Optimistic store: setter writes made while an action is running revert
 * to the pre-action state when the action completes.
 */
export function createOptimisticStore<T extends object>(seed: T): Store<T> {
  const [state, setState] = useStore(seed);
  const registered = new WeakSet<ActionContext>();

  const optimisticSet = ((...args: unknown[]) => {
    if (activeAction && !activeAction.done) {
      registerRevert(registered, () => {
        const snap = structuredClone(unwrap(state as T));
        return () => {
          setState((draftState) => {
            restoreSnapshot(
              draftState as Record<PropertyKey, unknown>,
              snap as Record<PropertyKey, unknown>,
            );
          });
        };
      });
    }
    (setState as (...a: unknown[]) => void)(...args);
  }) as Store<T>[1];

  return [state, optimisticSet];
}
