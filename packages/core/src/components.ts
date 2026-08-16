/**
 * The built-in flow components, on the M3 calling convention (`Comp(s, props)`,
 * every prop a `Cell`, every renderable slot a `Block`) and, since M4, holding
 * **no control-flow machinery of their own**.
 *
 * Each one below resolves its props and calls `branch`, `each`, `boundary` or
 * `portal` (`flow.ts`). What went with that: ten copy-pasted
 * `dispose → clearRange → createScope → insertNodes` bodies, the marker pair per
 * instance, `Show`'s `onCleanup` re-registered inside its own renderEffect,
 * `Dynamic`'s and `Portal`'s detached scopes, `Dynamic`'s fifth
 * element-creation path, `ErrorBoundary`'s build-then-install ordering, and
 * `Suspense`'s two `queueMicrotask`s that subscribed to nothing.
 * `CODESIGN.md` §4.1 is the audit; §3.4 is the replacement.
 *
 * These names are also the only path compiled code has: M4's `flow` pass — the
 * one that would emit `branch`/`each`/`boundary`/`portal` directly and hand them
 * a non-zero flags integer — did not land, so `<Show>` still compiles to
 * `Show($s, {…})` and reaches the adapter below at both `-O0` and `-Ox`. The
 * flags mechanism is therefore reachable from these adapters and from the
 * conformance suite, and from nothing the compiler emits.
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { childToNodes, setProp } from "./dom.ts";
import { REVEAL_COORD, createRevealCoordinator } from "./boundaries.ts";
import { clearRange, createMarker, createMarkerPair, insertNodes } from "./markers.ts";
import { COUNT, boundary, branch, each, portal } from "./flow.ts";
import { mapArray, repeat } from "./map.ts";
import { merge, omit } from "./props.ts";
import type { Block, Cell, Scope, Slot } from "./scope.ts";
import {
  computed,
  enter,
  exit,
  getOwner,
  provideOn,
  readSlot,
  underScope,
  untrack,
} from "./signals.ts";

export { createMarker, createMarkerPair, clearRange, insertNodes, childToNodes };
export { mapArray, repeat };

/**
 * A CELL-slot read (§3.0 rule 2): the value is called with no scope. A branded
 * Block reaching here is rule 3's throw, not a silent build under `CURRENT`.
 */
function readValue(slot: unknown, origin: string): unknown {
  return readSlot(slot, origin);
}

/** A renderable slot, as the primitives want it: a Block, or nothing. */
function slotBlock(slot: unknown): Block<unknown> | null {
  return slot === null || slot === undefined ? null : (slot as Block<unknown>);
}

/**
 * Invoke a renderable slot, scope first. Compiled code always supplies a Block
 * (C6); the un-compiled surface `packages/extra` is still on supplies built
 * nodes, and a value that is not callable is already its own answer.
 */
function callSlot(slot: unknown, scope: Scope | null, ...args: unknown[]): unknown {
  return typeof slot === "function" ? (slot as Block<unknown, unknown[]>)(scope, ...args) : slot;
}

/**
 * Fragment: a compile-time multi-root unit everywhere the compiler is involved
 * (C8). This is the un-compiled spelling `packages/extra`'s router still holds.
 */
export function Fragment(_s: Scope | null, props: { children?: Child | Child[] }): JSXElement {
  return underScope(_s, "Fragment", (s): JSXElement => {
    const fragment = document.createDocumentFragment();
    for (const node of childToNodes(props.children as Child, s)) fragment.appendChild(node);
    return fragment;
  });
}

/**
 * Show props — discriminated on `keyed` so children params infer:
 * - omitted / true (keyed): function children get the raw value; content
 *   re-renders when the value changes
 * - false (Solid 2.0 non-keyed): function children get a narrowed accessor, so
 *   content only re-renders when truthiness flips
 */
export type ShowProps<T> =
  | {
      when: Cell<T | undefined | null | false>;
      fallback?: Slot<Child>;
      keyed?: Cell<true>;
      children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
    }
  | {
      when: Cell<T | undefined | null | false>;
      fallback?: Slot<Child>;
      keyed: Cell<false>;
      children: Block<Child, [item: Cell<NonNullable<T>>]> | Cell<Child>;
    };

export function Show<T>(_s: Scope | null, props: ShowProps<T>): JSXElement {
  const value = computed(() => readValue(props.when, "Show.when") as T | undefined | null | false);
  const keyed = readValue(props.keyed, "Show.keyed");
  // Non-keyed: the key tracks only truthiness, so content survives a value
  // change. Keyed: the value itself is the key, so a new value is a new branch.
  // The KEY is what decides a rebuild, so it carries exactly what the mode says
  // it should: keyed (the default) re-renders when the value changes, so the
  // value IS the key; non-keyed re-renders only when truthiness flips, so the
  // key is the boolean. Every falsy value collapses onto one key, which is what
  // keeps a fallback in place across `0`, `""` and `null`.
  const key: Cell<unknown> =
    keyed === false
      ? (): unknown => value() !== false && !!value()
      : (): unknown => value() || false;
  const kids = props.children as unknown;
  // One body for every key (§3.4): it reads the value at ACTIVATION time, which
  // is why the branch takes no slot argument of its own. Keyed children get the
  // raw value; non-keyed get a narrowed accessor, so their reads stay live.
  const content: Block<unknown> = (scope: Scope | null): unknown => {
    const current = untrack(value);
    return current
      ? callSlot(kids, scope, keyed === false ? value : current)
      : callSlot(props.fallback, scope);
  };
  return branch(_s, null, null, key, content) as JSXElement;
}

/**
 * One list primitive, three modes, discriminated on `keyed` so children params
 * infer correctly:
 * - omitted / true: keyed by identity — children get (item, indexAccessor)
 * - a key fn: the row survives an item change, so the item arrives through a row
 *   SIGNAL — children get (itemAccessor, indexAccessor)
 * - false: positional — children get (itemAccessor, index)
 *
 * Each mode admits the LITERAL as well as a Cell carrying it. `For` reads the
 * slot through `readSlot`, and the compiler special-cases the literal spelling
 * — `<For keyed={false}>` resolves at compile time and never allocates a Cell —
 * so a type that demanded a Cell would make the direct-call form of the very
 * spelling the compiler prefers unwritable.
 */
export type ForProps<T, U extends JSXElement> =
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed?: Cell<true> | true;
      children: Block<U, [item: T, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed: Cell<(item: T) => unknown> | ((item: T) => unknown);
      children: Block<U, [item: Cell<T>, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Slot<Child>;
      keyed: Cell<false> | false;
      children: Block<U, [item: Cell<T>, index: number]>;
    };

export function For<T, U extends JSXElement>(_s: Scope | null, props: ForProps<T, U>): JSXElement {
  // `keyed`'s VALUE is a function, so a bare key function and a Cell carrying
  // one land in the same slot. They are told apart by the parameter a key
  // function declares and a Cell never does (§3.0 rule 1).
  const carrier = props.keyed as unknown;
  const resolved =
    typeof carrier === "function" && (carrier as { length: number }).length >= 1
      ? carrier
      : readValue(carrier, "For.keyed");
  const keyOf =
    typeof resolved === "function"
      ? (resolved as (item: T) => unknown)
      : resolved === false
        ? false
        : null;
  return eachOf(_s, props.each as Cell<readonly T[]>, keyOf, props, "For");
}

/**
 * Repeat (Solid 2.0) — render a block `count` times. No diffing: children get a
 * plain, stable index. `each`'s `COUNT` mode is the same primitive with a count
 * for a source.
 */
export function Repeat(
  _s: Scope | null,
  props: {
    count: Cell<number>;
    from?: Cell<number>;
    fallback?: Slot<Child>;
    children: Block<Child, [index: number]>;
  },
): JSXElement {
  const from = (): number => (readValue(props.from, "Repeat.from") as number | undefined) ?? 0;
  const count = (): number => readValue(props.count, "Repeat.count") as number;
  // `from` shifts the index the row Block sees, which `repeat` expresses and
  // `each`'s COUNT mode forwards; a zero shift is the overwhelming case.
  const shifted: Block<unknown> = (scope: Scope | null, index: unknown): unknown =>
    (props.children as unknown as (s: Scope | null, i: number) => unknown)(
      scope,
      (index as number) + from(),
    );
  return each(
    _s,
    null,
    null,
    count,
    COUNT,
    shifted as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  ) as JSXElement;
}

function eachOf<T>(
  s: Scope | null,
  source: Cell<readonly T[]>,
  keyOf: ((item: T) => unknown) | false | null,
  props: { children: unknown; fallback?: Slot<Child> },
  origin: string,
): JSXElement {
  const list = (): readonly T[] | undefined | null =>
    readValue(source, `${origin}.each`) as readonly T[] | undefined | null;
  return each(
    s,
    null,
    null,
    list as Cell<readonly T[]>,
    keyOf,
    props.children as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  ) as JSXElement;
}

export interface MatchProps<T> {
  when: Cell<T | undefined | null | false>;
  keyed?: Cell<boolean>;
  children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
}

/** C8-adjacent: `Match` is an identity function — `Switch` reads its props. */
export function Match<T>(_s: Scope | null, props: MatchProps<T>): JSXElement {
  return props as unknown as JSXElement;
}

/**
 * Switch — one `branch` whose key is the winning arm. `Match` builds nothing,
 * so re-invoking the children Block inside the memo costs an object per arm and
 * keeps every `when` read tracked by it.
 */
export function Switch(
  _s: Scope | null,
  props: { fallback?: Slot<Child>; children: Slot<JSXElement | JSXElement[]> },
): JSXElement {
  const arms = computed(() => {
    const resolved = callSlot(props.children, _s);
    const children = Array.isArray(resolved) ? resolved : [resolved];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as unknown as MatchProps<unknown>;
      if (!child || typeof child !== "object" || !("when" in child)) continue;
      const value = readValue(child.when, "Match.when");
      if (value) return { index: i, value, match: child };
    }
    return null;
  });

  // A key has to move when the ARM moves, and — for a keyed arm — when its
  // value moves. Both facts are scalars only after they are folded into one, so
  // the generation counter is the key and the two comparisons feed it.
  let generation = 0;
  let lastIndex: number | typeof UNSEEN = UNSEEN;
  let lastValue: unknown;
  const key = computed(() => {
    const found = arms();
    const index = found === null ? -1 : found.index;
    const value = found === null ? undefined : found.value;
    const keyed = found !== null && readValue(found.match.keyed, "Match.keyed") === true;
    if (index !== lastIndex || (keyed && value !== lastValue)) {
      generation++;
      lastIndex = index;
      lastValue = value;
    }
    return generation;
  });

  const body: Block<unknown> = (scope: Scope | null): unknown => {
    const found = untrack(arms);
    if (found === null) return callSlot(props.fallback, scope);
    return callSlot(found.match.children, scope, found.value);
  };

  return branch(_s, null, null, key, body) as JSXElement;
}

const UNSEEN: unique symbol = Symbol("unseen");

/**
 * Loading (Solid 2.0) — the async boundary. `boundary(kind: "loading")` is the
 * whole implementation; what it replaced was a second range, a parked
 * content fragment and a hand-rolled `moveRange`.
 */
export function Loading(
  _s: Scope | null,
  props: { fallback?: Slot<Child>; on?: Cell<unknown>; children: Slot<Child> },
): JSXElement {
  return boundary(
    _s,
    null,
    null,
    "loading",
    slotBlock(props.fallback),
    props.children as Block<unknown>,
    0,
    props.on === undefined ? undefined : () => readValue(props.on, "Loading.on"),
  ) as JSXElement;
}

/** Suspense — the pre-Solid-2.0 spelling of `Loading`. One boundary, not two. */
export function Suspense(
  _s: Scope | null,
  props: { fallback: Slot<Child>; children: Slot<Child> },
): JSXElement {
  return Loading(_s, props);
}

/**
 * Reveal (Solid 2.0, replaces SuspenseList) — a `provide`, which is one of O1's
 * six scope creators. It coordinates how descendant `Loading` boundaries reveal
 * their content and owns no range of its own.
 */
export function Reveal(
  _s: Scope | null,
  props: {
    order?: Cell<"sequential" | "together" | "natural">;
    collapsed?: Cell<boolean>;
    children: Slot<Child>;
  },
): JSXElement {
  const handle = createRevealCoordinator(
    () =>
      (readValue(props.order, "Reveal.order") as
        | "sequential"
        | "together"
        | "natural"
        | undefined) ?? "natural",
    () => readValue(props.collapsed, "Reveal.collapsed") === true,
  );
  // X1: enter, fork, write, invoke — in that order, and on a scope of its own
  // rather than on the caller's, which would put the coordinator in reach of
  // every sibling the caller has.
  const scope = enter(_s ?? null, "provide");
  try {
    provideOn(scope, REVEAL_COORD, handle);
    const fragment = document.createDocumentFragment();
    for (const node of childToNodes(callSlot(props.children, scope) as Child, scope)) {
      fragment.appendChild(node);
    }
    return fragment as unknown as JSXElement;
  } finally {
    exit(scope);
  }
}

/**
 * Errored (Solid 2.0) — the error boundary. E3: a branch on
 * `{content | fallback}` plus a `try`, with the catcher installed BEFORE the
 * content Block is invoked (E2.1) and `NotReadyError` re-thrown (E2.3).
 */
export function Errored(
  _s: Scope | null,
  props: {
    fallback: Block<Child, [error: Cell<Error>, reset: () => void]>;
    children: Slot<Child>;
  },
): JSXElement {
  return boundary(
    _s,
    null,
    null,
    "error",
    props.fallback as Block<unknown>,
    props.children as Block<unknown>,
  ) as JSXElement;
}

/**
 * ErrorBoundary — the pre-Solid-2.0 spelling, whose fallback takes the error by
 * VALUE where `Errored`'s takes an accessor. One adapter, one boundary.
 */
export function ErrorBoundary(
  _s: Scope | null,
  props: {
    fallback: Block<Child, [error: Error, reset: () => void]>;
    children: Slot<Child>;
  },
): JSXElement {
  const fallback: Block<unknown> = (scope: Scope | null, error: unknown, reset: unknown): unknown =>
    callSlot(props.fallback, scope, (error as Cell<Error>)(), reset);
  return boundary(
    _s,
    null,
    null,
    "error",
    fallback,
    props.children as Block<unknown>,
  ) as JSXElement;
}

/**
 * Await — render on a resource's state. Four states, four bodies, one `branch`
 * keyed on the state: exactly the shape §3.4 describes, and the reason the
 * detached scope that made `<Await>`'s subtree unreachable from the render root
 * is gone.
 */
export function Await<T>(
  _s: Scope | null,
  props: {
    resource: Cell<Resource<T>>;
    loading?: Slot<Child>;
    error?: Block<Child, [error: Error]>;
    children: Block<Child, [data: T]>;
  },
): JSXElement {
  // A `Resource` is itself callable, so forwarding one by name (C5) puts a
  // value-carrying Cell and the resource in the same slot. The resource is told
  // from its own value by a property it has and a value does not.
  const resolve = (): Resource<T> => {
    const carrier = props.resource as unknown;
    return (
      typeof carrier === "function" && "state" in carrier
        ? carrier
        : readValue(carrier, "Await.resource")
    ) as Resource<T>;
  };

  const key = (): number => {
    switch (resolve().state()) {
      case "pending":
        return 0;
      case "errored":
        return 1;
      default:
        return 2;
    }
  };

  const loading = slotBlock(props.loading);
  const failed: Block<unknown> = (scope: Scope | null): unknown => {
    const error = untrack(() => resolve().error());
    if (props.error && error) return callSlot(props.error, scope, error);
    return error ? document.createTextNode(error.message) : null;
  };
  const ready: Block<unknown> = (scope: Scope | null): unknown => {
    const data = untrack(() => resolve().latest());
    return data === undefined ? null : callSlot(props.children, scope, data);
  };

  return branch(_s, null, null, key, [loading, failed, ready]) as JSXElement;
}

/** Portal — `portal`, whose scope's parent is the LEXICAL one (§3.4, X4). */
export function Portal(
  _s: Scope | null,
  props: { target?: Cell<HTMLElement | string>; children: Slot<Child> },
): JSXElement {
  return portal(
    _s,
    () => readValue(props.target, "Portal.target") as HTMLElement | string | undefined,
    props.children as Block<unknown>,
  ) as unknown as JSXElement;
}

/**
 * Dynamic — a `branch` keyed on the component VALUE, with one body used for
 * every key (§3.4). The string arm renders through the same `createElement` the
 * rest of the runtime uses instead of the fifth element-creation path it had,
 * which is where the JSON-stringified attributes and the never-removed
 * listeners came from.
 */
export function Dynamic<
  T extends
    | keyof HTMLElementTagNameMap
    | ((s: Scope | null, props: Record<string, unknown>) => JSXElement),
>(_s: Scope | null, props: { component: Cell<T> } & Record<string, unknown>): JSXElement {
  const component = computed(() => readValue(props.component, "Dynamic.component") as T);
  const body: Block<unknown> = (scope: Scope | null): unknown => {
    const resolved = untrack(component);
    if (!resolved) return null;
    // C3/C5: `rest` is a VIEW of the same carriers, not a copy — the callee's
    // `props.x()` still reaches the caller's Cell.
    const rest = omit(props as Record<string, unknown>, "component");
    if (typeof resolved === "string") {
      return createDynamicElement(scope, resolved, rest);
    }
    return callSlot(resolved, scope, rest);
  };
  return branch(_s, null, null, component, body) as JSXElement;
}

/**
 * An intrinsic tag chosen at runtime. Every prop goes through the ONE prop
 * channel `setProp` owns, and every listener is registered on the instance
 * scope's own element, so it dies with the branch instance that created it (B4).
 */
function createDynamicElement(
  scope: Scope | null,
  tag: string,
  rest: Record<string, unknown>,
): Node {
  const element = document.createElement(tag);
  for (const name in rest) {
    if (name === "children") continue;
    // Applied ONCE, through the one prop channel. What the fifth
    // element-creation path did instead was `JSON.stringify` an object into an
    // attribute and `addEventListener` with nothing to remove it; `setProp`
    // resolves the channel and a delegated handler dies with the element (B4).
    // Liveness is B1's and lands with the element channels in M5.
    setProp(scope, element, name, readValue(rest[name], `Dynamic.${name}`));
  }
  const children = rest.children;
  if (children !== undefined && children !== null) {
    for (const node of childToNodes(children as Child, scope)) element.appendChild(node);
  }
  return element;
}

/**
 * dynamic(source) factory (Solid 2.0): a stable component whose identity is
 * driven reactively by `source`.
 */
export function dynamic<P extends Record<string, unknown>>(
  source: Cell<
    keyof HTMLElementTagNameMap | ((s: Scope | null, props: Record<string, unknown>) => JSXElement)
  >,
): (s: Scope | null, props: P) => JSXElement {
  return (s: Scope | null, props: P): JSXElement =>
    Dynamic(s, merge(props, { component: source }) as { component: Cell<never> });
}

export { mergeProps, merge, omit, splitProps } from "./props.ts";

export function children(fn: Slot<Child>, s: Scope | null = getOwner()): () => Node[] {
  return computed(() => childToNodes(callSlot(fn, s) as Child, s));
}
