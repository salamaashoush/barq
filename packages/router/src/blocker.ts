/**
 * TanStack's navigation blocking: `useBlocker`'s options form and `<Block>`.
 *
 * The router asks every registered blocker before a `navigate` and after a back
 * or forward button, and installs the `beforeunload` guard. What is here is the
 * part that belongs to a component: the resolver a confirmation dialog renders
 * from, and the registration that dies with the scope that made it.
 */

import { type Cell, type Incoming, type JSXElement, createSignal, onCleanup } from "@barqjs/core";

import { useRouter } from "./components.ts";
import type { BlockerLocation, HistoryAction, RouterState } from "./router.ts";

export interface ShouldBlockArgs {
  readonly current: BlockerLocation;
  readonly next: BlockerLocation;
  readonly action: HistoryAction;
}

export interface UseBlockerOptions {
  /** `true` blocks. Asked for every navigation, the back button included. */
  readonly shouldBlockFn: (args: ShouldBlockArgs) => boolean | Promise<boolean>;
  /** Also confirm closing or reloading the tab. Default `true`. */
  readonly enableBeforeUnload?: boolean | (() => boolean);
  /** Stop blocking without unregistering. A function is asked each time. */
  readonly disabled?: boolean | (() => boolean);
  /**
   * Hold a blocked navigation open until `proceed` or `reset` is called on the
   * resolver `useBlocker` returns, which is what a custom dialog needs.
   */
  readonly withResolver?: boolean;
}

/** What a confirmation dialog renders from. */
export type BlockerResolver =
  | {
      readonly status: "blocked";
      readonly current: BlockerLocation;
      readonly next: BlockerLocation;
      readonly action: HistoryAction;
      /** Let the navigation through. */
      readonly proceed: () => void;
      /** Stay. */
      readonly reset: () => void;
    }
  | {
      readonly status: "idle";
      readonly current: undefined;
      readonly next: undefined;
      readonly action: undefined;
      readonly proceed: undefined;
      readonly reset: undefined;
    };

const IDLE: BlockerResolver = {
  status: "idle",
  current: undefined,
  next: undefined,
  action: undefined,
  proceed: undefined,
  reset: undefined,
};

const answer = (given: boolean | (() => boolean) | undefined, fallback: boolean): boolean =>
  given === undefined ? fallback : typeof given === "function" ? given() : given;

/**
 * Register `options` with the router for as long as the calling scope lives.
 *
 * The resolver cell when `withResolver` is set, `undefined` otherwise.
 */
export function blockWith(
  state: RouterState,
  options: UseBlockerOptions,
): Cell<BlockerResolver> | undefined {
  const [resolver, setResolver] = createSignal<BlockerResolver>(IDLE);
  const off = state.block(
    async ({ current, next, action }) => {
      if (answer(options.disabled, false)) return false;
      // Leaving a page that matched nothing is never worth confirming.
      if (current.routeId === "__notFound__" && next.routeId !== "__notFound__") return false;
      const refused = await options.shouldBlockFn({ current, next, action });
      if (!refused || options.withResolver !== true) return refused;
      const stay = await new Promise<boolean>((resolve) => {
        setResolver({
          status: "blocked",
          current,
          next,
          action,
          proceed: () => resolve(false),
          reset: () => resolve(true),
        });
      });
      setResolver(IDLE);
      return stay;
    },
    {
      enableBeforeUnload: () =>
        !answer(options.disabled, false) && answer(options.enableBeforeUnload, true),
    },
  );
  onCleanup(off);
  return options.withResolver === true ? resolver : undefined;
}

export interface BlockProps extends UseBlockerOptions {
  /**
   * Plain children, or a function handed an ACCESSOR for the resolver, as every
   * other block argument in the framework is.
   */
  readonly children?: unknown;
}

/** A prop that arrives as the value or as the compiler's accessor around it. */
const unwrap = (slot: unknown): unknown =>
  typeof slot === "function" ? (slot as () => unknown)() : slot;

function BlockImpl(props: Incoming<BlockProps>): unknown {
  const flagOf = (slot: unknown): (() => boolean) | undefined =>
    slot === undefined ? undefined : (): boolean => Boolean(unwrap(slot));
  const resolver = blockWith(useRouter(), {
    // A function-valued attribute reaches a compiled component wrapped in an
    // accessor, so the first call may answer with the function itself.
    shouldBlockFn: (args) => {
      const first = (props.shouldBlockFn as unknown as (given: ShouldBlockArgs) => unknown)(args);
      return (
        typeof first === "function" ? (first as (given: ShouldBlockArgs) => unknown)(args) : first
      ) as boolean | Promise<boolean>;
    },
    enableBeforeUnload: flagOf(props.enableBeforeUnload),
    disabled: flagOf(props.disabled),
    withResolver: props.withResolver === undefined ? true : Boolean(unwrap(props.withResolver)),
  });
  const children = props.children as unknown;
  if (typeof children !== "function") return children ?? null;
  return (children as (given: Cell<BlockerResolver> | undefined) => unknown)(resolver);
}

/** `useBlocker` as a component: its children render the confirmation. */
export const Block = BlockImpl as unknown as (props: BlockProps) => JSXElement;
