import { type Accessor, batch, onCleanup, signal, untrack } from "@barqjs/core";
import type { Clear } from "./utils.ts";

/** What a transition may do besides changing state. */
export interface Transition<S extends string, C> {
  to: S;
  /** Refuse the transition by returning false. The machine stays where it is. */
  guard?: (context: C, payload: unknown) => boolean;
  /** Fold the payload into the context. Runs before the state changes. */
  action?: (context: C, payload: unknown) => C;
}

export interface StateNode<S extends string, E extends string, C> {
  /** Which event goes where. A bare state name is a transition with no guard. */
  on?: Partial<Record<E, S | Transition<S, C>>>;
  /**
   * Run on entering this state. A returned function runs on the way out, so a
   * timer or a subscription that belongs to one state is written beside it
   * rather than in an effect that has to re-derive which state it is in.
   */
  enter?: (context: C) => void | Clear;
}

export interface MachineConfig<S extends string, E extends string, C> {
  initial: S;
  context?: C;
  states: Record<S, StateNode<S, E, C>>;
}

export interface Machine<S extends string, E extends string, C> {
  state: Accessor<S>;
  context: Accessor<C>;
  /** Send an event. Returns whether it moved. */
  send: (event: E, payload?: unknown) => boolean;
  /** Whether this event would move the machine right now, guards included. */
  can: (event: E, payload?: unknown) => boolean;
  matches: (state: S) => boolean;
}

/**
 * A finite state machine with reactive state.
 *
 * The reason to reach for one over a handful of booleans: `loading && !error &&
 * !empty` has eight states and describes four, and the other four are the bugs.
 * Here an event that a state does not handle is ignored rather than producing
 * an impossible combination.
 *
 * ```ts
 * const fetcher = machine({
 *   initial: "idle",
 *   context: { tries: 0 },
 *   states: {
 *     idle:    { on: { FETCH: "loading" } },
 *     loading: {
 *       on: { RESOLVED: "ready", REJECTED: { to: "failed", action: (c) => ({ tries: c.tries + 1 }) } },
 *       enter: () => { const id = setTimeout(() => fetcher.send("REJECTED"), 5000);
 *                      return () => clearTimeout(id); },
 *     },
 *     ready:   { on: { FETCH: "loading" } },
 *     failed:  { on: { FETCH: "loading" } },
 *   },
 * });
 * ```
 *
 * `enter` runs for the initial state too, and its cleanup runs when the machine's
 * owner disposes — so a machine that is unmounted mid-flight leaves nothing armed.
 */
export function machine<S extends string, E extends string, C = undefined>(
  config: MachineConfig<S, E, C>,
): Machine<S, E, C> {
  const state = signal<S>(config.initial);
  const context = signal<C>(config.context as C);
  let exit: Clear | undefined;

  const resolve = (event: E, payload: unknown): Transition<S, C> | null => {
    const node = config.states[untrack(state)];
    const target = node.on?.[event];
    if (target === undefined) return null;
    // `Partial<Record<E, …>>` indexes to a union TypeScript will not narrow back
    // to `S` on its own, so the string arm is named rather than inferred.
    const transition: Transition<S, C> = typeof target === "string" ? { to: target as S } : target;
    if (transition.guard !== undefined && !transition.guard(untrack(context), payload)) return null;
    return transition;
  };

  const enter = (next: S): void => {
    exit?.();
    exit = undefined;
    const cleanup = config.states[next].enter?.(untrack(context));
    if (typeof cleanup === "function") exit = cleanup;
  };

  onCleanup(() => exit?.());
  enter(config.initial);

  return {
    state,
    context,

    send(event, payload) {
      const transition = resolve(event, payload);
      if (transition === null) return false;
      batch(() => {
        if (transition.action !== undefined) {
          context.set(transition.action(untrack(context), payload));
        }
        state.set(transition.to);
      });
      // Outside the batch: an `enter` that sends another event must see the
      // state it was entered for, not the one the batch is still holding.
      enter(transition.to);
      return true;
    },

    can: (event, payload) => resolve(event, payload) !== null,
    matches: (wanted) => state() === wanted,
  };
}
