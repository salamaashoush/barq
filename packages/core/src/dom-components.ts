/**
 * The components that only a document can render: a portal into another node,
 * a component chosen by tag name or value, and one that mounts only in the
 * browser.
 */

import { callSlot } from "./components.ts";
import type { AsDeclared, CallSite, Incoming, StrictAccessor, StrictChild } from "./config.ts";
import { resolveDynamic } from "./dom.ts";
import { branch, portal } from "./dom-flow.ts";
import { HYDRATE } from "./flow.ts";
import { hydrating, onHydrationEnd } from "./hydration-state.ts";
import type { ComponentProps, JSX } from "./jsx-runtime.ts";
import { omit } from "./props.ts";
import type { Block, Cell } from "./scope.ts";
import { block, createSignal, internalMemo, readSlot, untrack } from "./signals.ts";
import type { JSXElement } from "./types.ts";

export interface PortalProps extends CallSite<AsDeclared> {
  /**
   * Solid 2.0's name for this slot. It takes a selector STRING as well as a
   * node, which Solid's does not — `resolveTarget` looks one up — and that
   * is the one place this is wider than the reference rather than different
   * from it.
   */
  mount?: StrictAccessor<Node | string | null | undefined>;
  children: StrictChild;
}

/** What a `dynamic` source may answer with: a tag name or a function of one props object. */
export type DynamicTag = string | ((props: never) => unknown);

/**
 * What a call site of a `dynamic` component writes: the attributes of the tag
 * or the props of the component its source answers with. A tag this file does
 * not know, or one that is only known to be a string, takes any attribute.
 */
export type DynamicProps<T extends DynamicTag> = DynamicAttributes<T>;

/** The component `dynamic` returns. */
export type DynamicComponent<T extends DynamicTag> = (
  props: Record<string, unknown> & CallSite<DynamicProps<T>>,
) => JSXElement;

/**
 * The tags' attributes behind a string index, so that looking one up by a tag
 * not yet inferred answers with one loose record instead of a union of every
 * element's attributes. TypeScript resolves a type parameter against its
 * constraint before it infers it, and with that union as the contextual type
 * a single `dynamic` component costs more to check than a 200-file package
 * beside it.
 */
type TagAttributes = JSX.IntrinsicElements & { [tag: string]: Record<string, unknown> };

type DynamicAttributes<T> = T extends string
  ? TagAttributes[T]
  : T extends (props: never) => unknown
    ? JSX.LibraryManagedAttributes<T, ComponentProps<T>>
    : Record<string, unknown>;

/**
 * Solid 2.0's `clientOnly`: a dynamically imported component that renders only
 * in the browser. The server renders `props.fallback` and never starts the
 * import. The client shows the fallback until the import has resolved and
 * hydration has ended, then swaps the component in.
 *
 * The import starts when `clientOnly` is called. `{ lazy: true }` defers it to
 * the first render, and `{ export: "Name" }` takes a named export instead of
 * `default`. `moduleUrl` is the bundler's, which the server half turns into
 * preload links for the module.
 *
 * The swap is a two-armed region, the fallback in the first arm. The server
 * writes that region with the first arm chosen, so the client's first render,
 * which has to agree with it, claims the fallback the server wrote.
 *
 * @example
 * ```tsx
 * const Chart = clientOnly(() => import("./Chart.tsx"));
 * // <Chart fallback={<div>Loading chart</div>} data={data()} />
 * ```
 */
export function clientOnly<M extends Record<string, unknown>, K extends keyof M & string>(
  fn: () => Promise<M>,
  options: { lazy?: boolean; export: K },
  moduleUrl?: string,
): ClientOnlyComponent<M[K]>;
export function clientOnly<T extends (props: never) => unknown>(
  fn: () => Promise<{ default: T }>,
  options?: { lazy?: boolean; export?: string },
  moduleUrl?: string,
): ClientOnlyComponent<T>;
export function clientOnly(
  fn: () => Promise<Record<string, unknown>>,
  options: { lazy?: boolean; export?: string } = {},
  _moduleUrl?: string,
): ClientOnlyComponent<(props: Record<string, unknown>) => JSXElement> {
  type Loaded = (props: unknown) => JSXElement;
  // One module for every instance, so a second instance neither imports again
  // nor waits on an import of its own.
  const [loaded, setLoaded] = createSignal<Loaded | undefined>(undefined);
  const load = (): void => {
    void fn().then((module) => {
      const picked = module[options.export ?? "default"] as Loaded;
      setLoaded(() => picked);
    });
  };
  let started = options.lazy !== true;
  if (started) load();
  return (props) => {
    if (!started) {
      started = true;
      load();
    }
    const rest = omit(props, "fallback");
    const ready = untrack(loaded);
    if (ready !== undefined && !hydrating()) return untrack(() => ready(rest));
    const [mounted, setMounted] = createSignal(!hydrating());
    if (!untrack(mounted)) onHydrationEnd(() => setMounted(true));
    return branch(
      null,
      null,
      () => (loaded() !== undefined && mounted() ? 1 : 0),
      [block(() => callSlot(props.fallback)), block(() => untrack(loaded)!(rest))],
      HYDRATE,
    );
  };
}

/** What `clientOnly` returns: `T`'s props, and the `fallback` shown until it mounts. */
export type ClientOnlyComponent<T> = (
  props: (T extends (props: infer P) => unknown ? P : never) & Incoming<{ fallback?: JSX.Element }>,
) => JSXElement;

export function Portal(props: PortalProps): JSXElement {
  return portal(
    () => readSlot(props.mount, "Portal.mount") as Node | string | undefined,
    props.children as Block<unknown>,
  );
}

/**
 * Solid 2.0's `dynamic(source)`: a component whose tag or component is whatever
 * `source` answers, and moves when it does. Hoist it, to the module for a
 * source that reads module state or to the component body otherwise, and use
 * the result like any component: `const Field = dynamic(() => (rich() ? Editor
 * : "input"))`, then `<Field value={value()} />`.
 *
 * Each instance is a `branch` keyed on a memo of the source, so the swap and
 * the teardown are the branch's, and `resolveDynamic` decides whether the
 * value is a tag or a component. `@barqjs/server` has the string half under the
 * same name, which the compiler's server backend calls instead; both build the
 * memo and the range in the same order, so the owner ids and the range the
 * server writes are the ones the client claims.
 */
export function dynamic<T extends DynamicTag>(
  source: () => T | null | undefined | false,
): DynamicComponent<T> {
  return (props) => {
    const component = internalMemo(source);
    return branch(
      null,
      null,
      component,
      () => resolveDynamic(component as unknown as Cell<never>, props),
      HYDRATE,
    );
  };
}
