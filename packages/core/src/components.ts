/**
 * The flow components — the adapters `passes::flow` falls back to.
 *
 * ## Why these still exist, measured
 *
 * `CODESIGN.md` §4.1 lists all fourteen for deletion, and M9 deleted them and
 * put them back.
 *
 * It is not that a construct fails to lower. Every FORM of every construct
 * lowers — `<For>` alone covers identity-keyed (the K1 default), `keyed={false}`,
 * `keyed={fn}` and a `keyed` the analysis cannot prove, and all four emit
 * `_$each` with no `For` import left behind:
 *
 *     control-flow-for                    each=YES  keeps For import=no
 *     control-flow-for-keyed-by-item      each=YES  keeps For import=no
 *     control-flow-for-keyed-false        each=YES  keeps For import=no
 *     control-flow-for-keyed-fn           each=YES  keeps For import=no
 *     control-flow-for-keyed-unprovable   each=YES  keeps For import=no
 *     control-flow-for-keyed-spread       each=no   keeps For import=YES
 *
 * The exception is the last row, and it is not about `For`: P-new `flow` reads
 * a construct's PROPS to pick a lowering, and a spread is the one source it
 * cannot read. `<For {...opts}>` therefore stays a component call, and so would
 * `<Show {...p}>` or any of the other twelve. Over the whole 131-fixture corpus
 * that is the only surviving flow import there is.
 *
 * The string backend has the identical gap and the identical fallback —
 * `codegen::ssr::flow_call` routes the same shape to `ssrShow`/`ssrFor`/the
 * other ten, and a probe confirmed all eleven are reachable from legal source,
 * one construct at a time. So the fourteen adapters here and the twelve in
 * `ssr.ts` are ONE deletion, blocked on ONE compiler gap, and neither half can
 * go first: deleting them turns `<Show {...props}>` from a working program into
 * a load-time `SyntaxError: Export named 'Show' not found`.
 *
 * ## Why a spread cannot just lower like an element's does
 *
 * §5.3 put a spread back on the template path for ELEMENTS, so the obvious
 * question is why the same answer does not work here. The refusal is one line —
 * `passes::flow::admits_element` rejects a `SpreadAttribute` before any per-prop
 * reasoning runs — and the asymmetry behind it is real:
 *
 *  - On an element every name has the SAME KIND of destination: an attribute
 *    channel. `_$spread` resolves each at run time through the same tables the
 *    compiler reads, in source order. Unknown names cost nothing structural.
 *  - On a flow construct each prop decides a DIFFERENT PART OF THE LOWERING.
 *    `each`/`when`/`count` is the region's source; `fallback` is a second Block;
 *    `keyed` selects one of three key expressions; and `children` is the body
 *    Block whose PARAMETER LIST changes with the keying mode — `(item, index)`
 *    keyed, `(item(), index())` by key function, `(item(), index)` positional.
 *    `admits_value` says it for `keyed` in as many words: "the key it builds is
 *    a different expression depending on the answer… the two answers are
 *    different programs."
 *
 * The existing unprovable-prop rule does not stretch to cover it either.
 * `control-flow-for-keyed-unprovable` is `keyed={byId}` — a NAMED prop behind a
 * binding, where the compiler still knows WHICH prop it is and only its value is
 * opaque, so it can take "the key-function arm, which is the one that is safe
 * when wrong". A spread hides which props exist at all, so there is nothing for
 * that rule to apply to.
 *
 * **What lowering one would take:** emit the region against a merged source list
 * instead of named attributes — `_$each($s, parent, anchor, () => p.each,
 * keyOf(p), body, flags, () => p.fallback)` with `p = _$props([…])` — and then
 * settle the body's ARITY, which is the part that cannot become an argument
 * because it changes the emitted function's own parameter list. That last step
 * is the real blocker, and an adapter is exactly what a runtime keying decision
 * looks like. It is a compiler feature, and it is not M9's.
 *
 * ## What DID go, and stays gone
 *
 * The machinery. Each function below resolves its props and calls `branch`,
 * `each`, `boundary` or `portal` (`flow.ts`); what left at M4 was ten
 * copy-pasted `dispose -> clearRange -> scope -> insertNodes` bodies, the
 * marker pair per instance, `Show`'s `onCleanup` re-registered inside its own
 * renderEffect, `Dynamic`'s and `Portal`'s detached scopes, `Dynamic`'s fifth
 * element-creation path, `ErrorBoundary`'s build-then-install ordering, and
 * `Suspense`'s two `queueMicrotask`s that subscribed to nothing. `markers.ts`
 * went at M9 — these re-exported it and never called it — and so did
 * `children()`, `dynamic()` and the `DocumentFragment` `Fragment` built, which
 * C8 replaced with an array.
 */

import type { Resource } from "./async.ts";
import type { Child, JSXElement } from "./dom.ts";
import { dynamic } from "./dom.ts";
import { COUNT, boundary, branch, each, portal, reveal } from "./flow.ts";
import type { Block, Cell, Scope, Slot } from "./scope.ts";
import { omit } from "./props.ts";
import { computed, readSlot, untrack } from "./signals.ts";

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

export interface MatchProps<T> {
  when: Cell<T | undefined | null | false>;
  keyed?: Cell<boolean>;
  children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
}

export interface RepeatProps {
  count: Cell<number>;
  from?: Cell<number>;
  fallback?: Slot<Child>;
  children: Block<Child, [index: number]>;
}

export interface SwitchProps {
  fallback?: Slot<Child>;
  children: Slot<JSXElement | JSXElement[]>;
}

export interface LoadingProps {
  fallback?: Slot<Child>;
  on?: Cell<unknown>;
  children: Slot<Child>;
}

export interface RevealProps {
  order?: Cell<"sequential" | "together" | "natural">;
  collapsed?: Cell<boolean>;
  children: Slot<Child>;
}

export interface ErroredProps {
  fallback: Block<Child, [error: Cell<Error>, reset: () => void]>;
  children: Slot<Child>;
}

/** The pre-Solid-2.0 spelling, whose fallback takes the error by VALUE. */
export interface ErrorBoundaryProps {
  fallback: Block<Child, [error: Error, reset: () => void]>;
  children: Slot<Child>;
}

export interface AwaitProps<T> {
  resource: Cell<Resource<T>>;
  loading?: Slot<Child>;
  error?: Block<Child, [error: Error]>;
  children: Block<Child, [data: T]>;
}

export interface PortalProps {
  target?: Cell<HTMLElement | string>;
  children: Slot<Child>;
}

export type DynamicComponent =
  | keyof HTMLElementTagNameMap
  | ((s: Scope | null, props: Record<string, unknown>) => JSXElement);

/** A CELL-slot read (§3.0 rule 2): the value is called with no scope. */
function readValue(slot: unknown, origin: string): unknown {
  return readSlot(slot, origin);
}

function slotBlock(slot: unknown): Block<unknown> | null {
  return slot === null || slot === undefined ? null : (slot as Block<unknown>);
}

function callSlot(slot: unknown, scope: Scope | null, ...args: unknown[]): unknown {
  return typeof slot === "function" ? (slot as Block<unknown, unknown[]>)(scope, ...args) : slot;
}

export function Fragment(_s: Scope | null, props: { children?: Child | Child[] }): JSXElement {
  // C8: a fragment is an ARRAY of its parts. Nothing builds a DocumentFragment.
  const kids = props.children;
  return (Array.isArray(kids) ? kids : [kids]) as unknown as JSXElement;
}

export function Show<T>(
  _s: Scope | null,
  props: { when: unknown; fallback?: unknown; keyed?: unknown; children: unknown },
): JSXElement {
  const value = computed(() => readValue(props.when, "Show.when") as T | undefined | null | false);
  const keyed = readValue(props.keyed, "Show.keyed");
  // The KEY decides a rebuild, so it carries exactly what the mode says it
  // should: keyed (the default) re-renders when the value changes, so the value
  // IS the key; non-keyed re-renders only when truthiness flips, so the key is
  // the boolean. Every falsy value collapses onto one key, which keeps a
  // fallback in place across `0`, `""` and `null`.
  const key: Cell<unknown> =
    keyed === false
      ? (): unknown => value() !== false && !!value()
      : (): unknown => value() || false;
  const content: Block<unknown> = (scope: Scope | null): unknown => {
    const current = untrack(value);
    return current
      ? callSlot(props.children, scope, keyed === false ? value : current)
      : callSlot(props.fallback, scope);
  };
  return branch(_s, null, null, key, content) as JSXElement;
}

export function For<T>(
  _s: Scope | null,
  props: { each: unknown; fallback?: unknown; keyed?: unknown; children: unknown },
): JSXElement {
  // §3.0 rule 1 — a Cell declares no parameter and a key function declares one
  // — is `each`'s own, so the carrier goes through unresolved. This adapter and
  // the compiler's spread lowering therefore reach the primitive with the same
  // argument rather than with two implementations of one rule.
  return each(
    _s,
    null,
    null,
    props.each as Cell<readonly T[]>,
    props.keyed as Cell<unknown>,
    props.children as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  ) as JSXElement;
}

export function Repeat(
  _s: Scope | null,
  props: { count: unknown; from?: unknown; fallback?: unknown; children: unknown },
): JSXElement {
  const from = (): number => (readValue(props.from, "Repeat.from") as number | undefined) ?? 0;
  const count = (): number => readValue(props.count, "Repeat.count") as number;
  const shifted: Block<unknown> = (scope: Scope | null, index: unknown): unknown =>
    (props.children as (s: Scope | null, i: number) => unknown)(scope, (index as number) + from());
  return each(
    _s,
    null,
    null,
    count as Cell<number>,
    COUNT,
    shifted as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  ) as JSXElement;
}

/** C8-adjacent: `Match` is an identity function — `Switch` reads its props. */
export function Match<T>(_s: Scope | null, props: T): JSXElement {
  return props as unknown as JSXElement;
}

export function Switch(
  _s: Scope | null,
  props: { fallback?: unknown; children: unknown },
): JSXElement {
  const arms = computed(() => {
    const resolved = callSlot(props.children, _s);
    const children = (Array.isArray(resolved) ? resolved : [resolved]) as Array<{
      when?: unknown;
      keyed?: unknown;
      children?: unknown;
    }>;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
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

export function Loading(
  _s: Scope | null,
  props: { fallback?: unknown; on?: unknown; children: unknown },
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

/** The pre-Solid-2.0 spelling of `Loading`. One boundary, not two. */
export function Suspense(
  _s: Scope | null,
  props: { fallback: unknown; children: unknown },
): JSXElement {
  return Loading(_s, props);
}

export function Errored(
  _s: Scope | null,
  props: { fallback: unknown; children: unknown },
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

/** The pre-Solid-2.0 spelling, whose fallback takes the error by VALUE. */
export function ErrorBoundary(
  _s: Scope | null,
  props: { fallback: unknown; children: unknown },
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

export function Portal(
  _s: Scope | null,
  props: { target?: unknown; children: unknown },
): JSXElement {
  return portal(
    _s,
    () => readValue(props.target, "Portal.target") as Node | string | undefined,
    props.children as Block<unknown>,
  ) as unknown as JSXElement;
}

/**
 * `<Dynamic component={c}>` — a `branch` keyed on the component VALUE with one
 * body for every key, and `dynamic` inside it. §3.13 item 4: the tag or component
 * cannot be resolved at compile time, so the choice is made at run time and
 * nowhere else. The swap and the teardown are the branch's.
 */
export function Dynamic(
  _s: Scope | null,
  props: { component: unknown } & Record<string, unknown>,
): JSXElement {
  const component = computed(() => readValue(props.component, "Dynamic.component"));
  const rest = omit(props, "component");
  return branch(_s, null, null, component, (scope: Scope | null) =>
    dynamic(scope, component as unknown as Cell<never>, rest),
  ) as JSXElement;
}

/**
 * `<Await>` — TWO NESTED BOUNDARIES, not a three-state adapter (§4.1's M9 note).
 *
 * Reading a resource throws `NotReadyError` before it settles and throws the
 * error after it fails, so the three-state key the old adapter computed is what
 * the boundaries already answer: an error boundary outside, a loading boundary
 * inside, and the body reads the resource.
 */
export function Await<T>(
  _s: Scope | null,
  props: { resource: unknown; loading?: unknown; error?: unknown; children: unknown },
): JSXElement {
  const read = (): T => {
    const carrier = props.resource;
    const resolved =
      typeof carrier === "function" && "loading" in (carrier as object)
        ? carrier
        : readValue(carrier, "Await.resource");
    return (resolved as () => T)();
  };
  const inner: Block<unknown> = (scope: Scope | null): unknown =>
    boundary(scope, null, null, "loading", slotBlock(props.loading), ((s: Scope | null): unknown =>
      callSlot(props.children, s, read())) as Block<unknown>);
  if (props.error === undefined) return inner(_s) as JSXElement;
  return boundary(
    _s,
    null,
    null,
    "error",
    ((s: Scope | null, error: unknown): unknown =>
      callSlot(props.error, s, (error as Cell<Error>)())) as Block<unknown>,
    inner,
  ) as JSXElement;
}

/**
 * Reveal (Solid 2.0, replaces SuspenseList) — a `provide`, which is one of O1's
 * six scope creators. It coordinates how descendant `Loading` boundaries reveal
 * their content and owns no range of its own.
 */
export function Reveal(
  _s: Scope | null,
  props: { order?: unknown; collapsed?: unknown; children: unknown },
): JSXElement {
  return reveal(
    _s,
    () =>
      (readValue(props.order, "Reveal.order") as
        | "sequential"
        | "together"
        | "natural"
        | undefined) ?? "natural",
    () => readValue(props.collapsed, "Reveal.collapsed") === true,
    props.children as Block<unknown>,
  ) as unknown as JSXElement;
}
