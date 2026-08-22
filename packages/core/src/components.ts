/**
 * The flow components — the adapters `passes::flow` falls back to.
 *
 * ## Why these exist, and why the deletion §4.1 asks for cannot happen
 *
 * `CODESIGN.md` §4.1 lists the fourteen for deletion. M9 deleted them, put them
 * back, and recorded the blocker as one compiler gap — a construct whose props
 * arrive through a SPREAD stays a component call. M10 closed that gap for ten of
 * the thirteen and found the row was wrong for a reason that has nothing to do
 * with spreads.
 *
 * **`Opt::flow` is a flippable knob and `-O0` turns it off.** At `-O0` the flow
 * pass does not run, so every construct is a component call and reaches the
 * adapter here. Compiling the whole corpus at both levels:
 *
 *     -Ox   0 of 131 fixtures keep a flow import
 *     -O0  37 of 131 keep one, across ALL THIRTEEN constructs
 *          For 16 · Show 14 · Match 3 · Switch 3 · Errored 2 · Repeat 2
 *          Reveal 2 · Await 1 · Dynamic 1 · ErrorBoundary 1 · Loading 1
 *          Portal 1 · Suspense 1
 *
 * And `-O0` is not a debug convenience: §6 L3 grades every optimisation by
 * rendering the corpus at both levels and requiring the frames to agree, so the
 * `-O0` emission is the flow pass's own reference. Deleting these would delete
 * what the pass is graded against. The row is struck, not deferred.
 *
 * Three constructs also still refuse at `-Ox`, each for a stated reason in
 * `passes::flow::admits_spread`, so their adapters are reachable from an
 * optimised build as well: `Switch` needs literal `<Match>` arms it can read
 * (`admits_arms`), `Match` goes with it, and `Dynamic`'s unrecognised props are
 * the RESOLVED component's rather than the construct's.
 *
 * ## What M10 did buy, measured
 *
 * The last surviving flow import at `-Ox` went. Before, `<For {...opts}>`
 * emitted `_$insert($s, el, For($s, _$props([…])))` — an adapter frame inside an
 * insert hole, at a position the compiler already knew. Now it emits
 * `_$each($s, el, null, …)` against a binding the source list is evaluated into
 * once, which is the `(parent, anchor)` pair §3.4 exists to deliver.
 *
 * On `control-flow-for-keyed-spread`, the one fixture that had this shape
 * before: effects 3 created / 8 runs, unchanged; clones 3, unchanged; emitted
 * function 327 → 336 bytes. The counters do not move because the work was
 * always the same work — what leaves is the frame it went through and the
 * import that pulled this file into the bundle.
 *
 * `control-flow-spread-precedence` reads 4 created / 10 runs, which is exactly
 * `control-flow-for-keyed-false`'s row: a lowered spread costs what the static
 * equivalent costs.
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
 *
 * `For`'s copy of §3.0 rule 1 went at M10: `each`'s own `keyMode` resolves the
 * keying carrier for both the adapter and the compiled path, so there is one
 * implementation of it rather than three.
 */

import type { Child, JSXElement } from "./dom.ts";
import { dynamic } from "./dom.ts";
import { COUNT, boundary, branch, each, portal, reveal } from "./flow.ts";
import type { Block, Cell, Scope, Slot } from "./scope.ts";
import { omit } from "./props.ts";
import { computed, readSlot, resolve, runWithOwner, untrack } from "./signals.ts";

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
      keyed?: Cell<false>;
      children: Block<Child, [item: Cell<NonNullable<T>>]> | Cell<Child>;
    }
  | {
      when: Cell<T | undefined | null | false>;
      fallback?: Slot<Child>;
      keyed: Cell<true>;
      children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
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

export type MatchProps<T> =
  | {
      when: Cell<T | undefined | null | false>;
      keyed?: Cell<false>;
      children: Block<Child, [item: Cell<NonNullable<T>>]> | Cell<Child>;
    }
  | {
      when: Cell<T | undefined | null | false>;
      keyed: Cell<true>;
      children: Block<Child, [item: NonNullable<T>]> | Cell<Child>;
    };

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

export interface PortalProps {
  /**
   * Solid 2.0's name for this slot. It takes a selector STRING as well as an
   * element, which Solid's does not — `resolveTarget` looks one up — and that
   * is the one place this is wider than the reference rather than different
   * from it.
   */
  mount?: Cell<HTMLElement | string>;
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

export function Show(
  _s: Scope | null,
  props: { when: unknown; fallback?: unknown; keyed?: unknown; children: unknown },
): JSXElement {
  const value = computed(() => readValue(props.when, "Show.when"));
  const keyed = readValue(props.keyed, "Show.keyed") === true;
  // The KEY decides a rebuild, so it carries exactly what the mode says it
  // should. The DEFAULT is non-keyed (Solid 2.0): content re-renders only when
  // truthiness flips, so the key is the boolean and the children are handed the
  // narrowed ACCESSOR — an immutable update to a still-truthy value updates the
  // content in place instead of rebuilding it. `keyed` opts into the other one,
  // where the value IS the key and a new value is a new instance.
  //
  // Every falsy value collapses onto one key, which keeps a fallback in place
  // across `0`, `""` and `null`.
  const key: Cell<unknown> = keyed
    ? (): unknown => value() || false
    : (): unknown => value() !== false && !!value();
  const content: Block<unknown> = (scope: Scope | null): unknown => {
    const current = untrack(value);
    return current
      ? callSlot(props.children, scope, keyed ? current : value)
      : callSlot(props.fallback, scope);
  };
  return branch(_s, null, null, key, content);
}

/**
 * MEASURED AND ABANDONED: `<For>`'s callback cannot infer its item type.
 *
 * Not for want of a props type. Three were built and each failed for its own
 * reason, and the third failure is structural rather than fixable:
 *
 * 1. A union mirroring `ForProps`'s three arms — TypeScript gives a callback NO
 *    contextual type when the contextual type is a union of differing
 *    signatures, so every callback stayed an implicit `any`.
 * 2. One object with `children` conditional on a `keyed` type parameter — the
 *    callback is contextually typed now, and typed with `unknown`, because
 *    inferring the item through `StrictArrayAccessor`'s six-member union
 *    resolves to `unknown`.
 * 3. `each` inferred WHOLE with the item read back out of it — same answer, and
 *    this is where it stops. `LibraryManagedAttributes` reaches barq's props
 *    through `C extends (scope, props: infer Q) => any`, and `infer Q` against a
 *    GENERIC signature instantiates its parameters at their constraints. Type
 *    arguments are inferred from a component's FIRST parameter, which under
 *    §3.2's calling convention is the scope. So no generic barq component can
 *    infer anything from its JSX attributes, whatever its props type says.
 *
 * The props stay permissive, which is what `Show` and `Repeat` also do, and a
 * call site that wants the type annotates its callback —
 * `{(row: Row) => …}` — which is what `routes/route.tsx` already did.
 */
export function For(
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
    props.each as Cell<readonly unknown[]>,
    props.keyed as Cell<unknown>,
    props.children as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  );
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
  );
}

/**
 * C8-adjacent: `Match` is an identity function — `Switch` reads its props.
 *
 * The parameter is a concrete shape and not a bare `T`, which is what `Show`
 * already does: `LibraryManagedAttributes` picks the props off the SECOND
 * parameter with `infer Q`, and an unresolved generic infers `unknown` there
 * and falls back to the first — so `<Match when={…}>` checked its attributes
 * against `Scope` and reported every one of them missing.
 */
export function Match(
  _s: Scope | null,
  props: { when: unknown; keyed?: unknown; children: unknown },
): JSXElement {
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
    // A `Match` follows `Show`: non-keyed by default, so its children are
    // handed the narrowed ACCESSOR and the arm's content updates in place
    // across a value change. A keyed arm gets the value, and the generation
    // counter above is what rebuilds it.
    const keyed = readValue(found.match.keyed, "Match.keyed") === true;
    const narrowed = (): unknown => {
      const now = arms();
      return now === null ? undefined : now.value;
    };
    return callSlot(found.match.children, scope, keyed ? found.value : narrowed);
  };

  return branch(_s, null, null, key, body);
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
  );
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
  );
}

export function Portal(
  _s: Scope | null,
  props: { mount?: unknown; children: unknown },
): JSXElement {
  return portal(
    _s,
    () => readValue(props.mount, "Portal.mount") as Node | string | undefined,
    props.children as Block<unknown>,
  );
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
  );
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
        | undefined) ?? "sequential",
    () => readValue(props.collapsed, "Reveal.collapsed") === true,
    props.children as Block<unknown>,
  );
}

/**
 * A component whose module is fetched on first render.
 *
 * The whole of it is a `computed` over the import, and every mechanism it needs
 * already exists: a compute returning a Promise leaves the node pending, a read
 * before it settles throws `NotReadyError`, an effect that throws one registers
 * with the nearest `Loading` boundary, and a suspended body is retried TRACKED
 * so the module landing wakes it. `Errored` re-throws `NotReadyError` rather
 * than catching it, so a boundary between the two does not swallow the wait.
 *
 * It lives here rather than in a router because all four of those are private
 * to `signals.ts` and `flow.ts`. What a router owns is the other half —
 * `preload()` on a route's chunk, and the `<link rel=modulepreload>` that
 * shortens the wait — because that is bundler and route-tree knowledge this
 * package has none of.
 *
 * NO OWNER and NO SEED KEY, deliberately. The cell is module-scoped and must
 * outlive whatever position happened to read it first — a cell owned by a
 * boundary's content dies when that content is discarded, which is a real
 * failure mode and not a hypothetical one. And a module is not a value to seed:
 * the client fetches its own chunk, so a key here would claim a seed slot for
 * something the server cannot send.
 *
 * Named `default` because that is what a route module exports; pass a `pick` to
 * take something else.
 */
// `P` is the props type of the component this RETURNS, which is the only
// thing a caller can say about a module it has not loaded yet.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function lazy<P = unknown>(
  load: () => Promise<Record<string, unknown>>,
  pick: (module: Record<string, unknown>) => unknown = (module) => module.default,
): ((s: Scope | null, props: P) => JSXElement) & {
  preload: () => Promise<void>;
  ready: () => void;
} {
  let cell: Cell<unknown> | null = null;
  const resolved = (): Cell<unknown> =>
    (cell ??= runWithOwner(null, () => computed(async () => pick(await load()))));

  const component = (s: Scope | null, props: P): JSXElement => {
    const Loaded = resolved()() as (s: Scope | null, props: P) => JSXElement;
    return Loaded(s, props);
  };

  // Warms the SAME cell. `resolve` awaits the cell's first settled value rather
  // than calling `load()` again — a second call is a second fetch on any loader
  // that is not itself memoised, and it made `preload()` import twice.
  component.preload = async (): Promise<void> => {
    await resolve(resolved());
  };

  /**
   * A TRACKED read of the module, for a caller that must subscribe to it.
   *
   * Invoking the component reads the cell too, but a caller that invokes it
   * inside `untrack` establishes no dependency — so the `NotReadyError` parks a
   * boundary that the module landing can never wake. `@barqjs/router` is exactly
   * that caller: `CODESIGN.md` §3.9 makes component bodies run untracked on
   * purpose, so a route reading `props.params()` does not resubscribe its whole
   * subtree. Measured before this existed: navigating to a code-split route
   * showed its fallback forever, and every route a file-based table generates is
   * code-split.
   *
   * Throws `NotReadyError` until the module is here, which is what a boundary
   * above it is for.
   */
  component.ready = (): void => {
    resolved()();
  };

  return component;
}
