/**
 * TanStack's `<CatchBoundary>` and `<CatchNotFound>`: an error boundary an
 * application places itself, anywhere in a tree.
 *
 * A route depth already has one of its own. These are for the region inside a
 * route that should fail without taking the route with it.
 */

import {
  type Block,
  type Cell,
  type Incoming,
  type JSXElement,
  HYDRATE,
  block,
  boundary,
  createEffect,
  read,
} from "@barqjs/core";

import { LinkBackendContext, RouterContext, componentSlot } from "./components.ts";
import { isNotFound } from "./errors.ts";

export interface CatchBoundaryProps {
  /** When what this returns changes, a caught error is cleared and the children are tried again. */
  readonly getResetKey: () => number | string;
  readonly children?: unknown;
  /** Rendered in place of the children once they have thrown. Nothing when absent. */
  readonly errorComponent?: import("./route.ts").ErrorComponent;
  readonly onCatch?: (error: Error) => void;
}

/**
 * TanStack's `<CatchBoundary>`: an error boundary anywhere in a tree, with the
 * same `errorComponent` props a route's gets.
 *
 * `filter` is how `<CatchNotFound>` shares it: an error the filter refuses is
 * thrown again from the fallback, which hands it to the boundary above.
 */
function caughtRegion(
  props: Incoming<CatchBoundaryProps>,
  filter?: (error: Error) => boolean,
): unknown {
  // A function-valued attribute reaches a compiled component wrapped in an
  // accessor, so the first call may answer with the function itself.
  const resetKey = (): unknown => {
    const first = (props.getResetKey as unknown as () => unknown)();
    return typeof first === "function" ? (first as () => unknown)() : first;
  };
  let clear: (() => void) | null = null;
  const errorFallback = ((error: () => Error, reset: () => void): unknown => {
    const thrown = error();
    if (filter !== undefined && !filter(thrown)) throw thrown;
    clear = reset;
    const onCatch = componentSlot(props.onCatch) as ((caught: Error) => void) | undefined;
    onCatch?.(thrown);
    const component = componentSlot(props.errorComponent) as
      | ((given: unknown) => unknown)
      | undefined;
    if (component === undefined) return null;
    return component({
      error,
      reset,
      params: EMPTY_PARAMS,
      data: (): unknown => (isNotFound(thrown) ? thrown.data : undefined),
    });
  }) as Block<unknown>;
  const children = props.children;
  const content = block(() =>
    typeof children === "function" ? (children as () => unknown)() : (children ?? null),
  );

  const backend = read(LinkBackendContext)();
  if (backend?.caught !== undefined) return backend.caught(errorFallback, content);

  // A reset flushes, and a flush from inside an effect is refused, so it runs
  // once this one has returned.
  createEffect(resetKey, (next, previous) => {
    if (previous === undefined || next === previous) return;
    const reset = clear;
    clear = null;
    if (reset !== null) queueMicrotask(reset);
  });
  return boundary(null, null, "error", errorFallback, content, HYDRATE);
}

const EMPTY_PARAMS = (): Record<string, string> => ({});

export const CatchBoundary = caughtRegion as unknown as (props: CatchBoundaryProps) => JSXElement;

export interface CatchNotFoundProps {
  /** Rendered when a `notFound()` is thrown below. Handed the error as an accessor. */
  readonly fallback?: (error: Cell<Error>) => unknown;
  readonly onCatch?: (error: Error) => void;
  readonly children?: unknown;
}

/**
 * TanStack's `<CatchNotFound>`: catches a `notFound()` thrown below it and
 * nothing else, so an ordinary failure still reaches the error boundary above.
 */
function CatchNotFoundImpl(props: Incoming<CatchNotFoundProps>): unknown {
  // The path is the reset key, as theirs is: a not-found is about a location,
  // and leaving that location is what makes it stale.
  const state = read(RouterContext)();
  const shown = (given: { readonly error: Cell<Error> }): unknown => {
    const fallback = componentSlot(props.fallback) as ((error: Cell<Error>) => unknown) | undefined;
    return fallback === undefined ? null : fallback(given.error);
  };
  return caughtRegion(
    {
      getResetKey: (): string => `not-found-${state.location().pathname}`,
      onCatch: props.onCatch,
      children: props.children,
      errorComponent: (): typeof shown => shown,
    } as never,
    isNotFound,
  );
}

export const CatchNotFound = CatchNotFoundImpl as unknown as (
  props: CatchNotFoundProps,
) => JSXElement;
