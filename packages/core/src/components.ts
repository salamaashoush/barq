/**
 * The flow components — the adapters `passes::flow` falls back to.
 *
 * ## Why these exist, and why they cannot be deleted
 *
 * Fourteen of these were listed for deletion. They were deleted, put back, and
 * the blocker recorded as one compiler gap: a construct whose props arrive
 * through a SPREAD stays a component call. Ten of the thirteen were closed
 * later, and the row turned out to be wrong for a reason that has nothing to do
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
 * And `-O0` is not a debug convenience: every optimisation is graded by
 * rendering the corpus at both levels and requiring the frames to agree, so the
 * `-O0` emission is the flow pass's own reference. Deleting these would delete
 * what the pass is graded against.
 *
 * Two constructs also still refuse at `-Ox`, for a stated reason in
 * `passes::flow::admits_spread`, so their adapters are reachable from an
 * optimised build as well: `Switch` needs literal `<Match>` arms it can read
 * (`admits_arms`), and `Match` goes with it.
 *
 * ## What M10 did buy, measured
 *
 * The last surviving flow import at `-Ox` went. Before, `<For {...opts}>`
 * emitted `_$insert($s, el, For($s, _$props([…])))` — an adapter frame inside an
 * insert hole, at a position the compiler already knew. Now it emits
 * `_$each($s, el, null, …)` against a binding the source list is evaluated into
 * once, which is the `(parent, anchor)` pair the lowering exists to deliver.
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
 * the `DocumentFragment` `Fragment` built, which C8 replaced
 * with an array.
 *
 * `For`'s own copy of the arity rule is gone: `each`'s `keyMode` resolves the
 * keying carrier for both the adapter and the compiled path, so there is one
 * implementation of it rather than three.
 */

import type {
  Accessor,
  AsDeclared,
  CallSite,
  Incoming,
  StrictAccessor,
  StrictChild,
} from "./config.ts";
import type { ArrayElement, Child, JSXElement } from "./dom.ts";
import { reportModule } from "./head.ts";
import { hydrating, onHydrationEnd } from "./hydration.ts";
import { omit } from "./props.ts";
import { resolveDynamic } from "./dom.ts";
import { COUNT, HYDRATE, boundary, branch, each, island, portal, reveal } from "./flow.ts";
import type { ComponentProps, JSX } from "./jsx-runtime.ts";
import type { Block, Cell } from "./scope.ts";
import {
  NotReadyError,
  block,
  createMemo,
  createSignal,
  getOwner,
  hydrationScope,
  internalMemo,
  createRoot,
  isBlock,
  readSlot,
  resolve,
  runWithOwner,
  untrack,
} from "./signals.ts";

/**
 * The flow components' props take a value or an accessor in every reactive
 * slot. A JSX call site writes the value and the compiler wraps it; compiled
 * code hands over the Cell or the Block. They are `CallSite<AsDeclared>`, so
 * attributes are checked against them as written. `For` declares a call-site
 * type of its own beside what the adapter is handed, and so does the component
 * `dynamic` returns.
 */

/**
 * Content in a slot that also takes a callback.
 *
 * `Child` admits a function of any arity, which every callback matches, so
 * beside it the callback's own signature is not the single one that types its
 * parameters. The zero-arity accessor stands in for that member.
 */
type Content = Exclude<Child, (...args: never[]) => unknown> | Accessor<Child>;

/**
 * What `<Show>` and `<Match>` hand their children: a narrowed accessor, so the
 * content updates in place while the value stays truthy, or under `keyed` the
 * value itself, rebuilt when it changes.
 */
export type ShowItem<T, K extends boolean = false> = K extends true
  ? NonNullable<T>
  : Accessor<NonNullable<T>>;

/**
 * One shape rather than a union on `keyed`: a callback gets no contextual type
 * from a union of differing signatures, so the mode is a type parameter and the
 * callback's parameter is conditional on it.
 */
export interface ShowProps<T, K extends boolean = false> extends CallSite<AsDeclared> {
  when: StrictAccessor<T | undefined | null | false>;
  fallback?: StrictChild;
  keyed?: StrictAccessor<K>;
  children: Content | ((item: ShowItem<T, K>) => Child);
}

export type ForProps<T, U extends JSXElement> =
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Child;
      keyed?: Cell<true> | true;
      children: Block<U, [item: T, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Child;
      keyed: Cell<(item: T) => unknown> | ((item: T) => unknown);
      children: Block<U, [item: Cell<T>, index: Cell<number>]>;
    }
  | {
      each: Cell<readonly T[] | undefined | null>;
      fallback?: Child;
      keyed: Cell<false> | false;
      children: Block<U, [item: Cell<T>, index: number]>;
    };

/** `true` or omitted keys a row by its item, `false` by its index, a function by what it returns. */
export type ForKeyed<T> = boolean | ((item: T) => unknown);

/** A row's item: the value when the row is keyed by it, an accessor otherwise. */
export type ForItem<T, K> = K extends true ? T : Accessor<T>;

/** A row's index: a number when the row is keyed by it, an accessor otherwise. */
export type ForIndex<K> = K extends false ? number : Accessor<number>;

/**
 * `<For>` as a JSX call site writes it. `ForProps` is what the adapter is
 * handed, three shapes on `keyed`; here the mode is `K`, so the row callback is
 * one signature and its parameters infer.
 */
export interface ForCallSite<T, K extends ForKeyed<T> = true> {
  each: StrictAccessor<readonly T[] | undefined | null | false>;
  // `NoInfer`: the item type is `each`'s to decide. A key function or a row
  // callback that annotates its parameter more narrowly would otherwise pull
  // `T` down to the annotation.
  keyed?: K | ((item: NoInfer<T>) => unknown);
  fallback?: StrictChild;
  children: (item: ForItem<NoInfer<T>, K>, index: ForIndex<K>) => Child;
}

export interface MatchProps<T, K extends boolean = false> extends CallSite<AsDeclared> {
  when: StrictAccessor<T | undefined | null | false>;
  keyed?: StrictAccessor<K>;
  children: Content | ((item: ShowItem<T, K>) => Child);
}

export interface RepeatProps extends CallSite<AsDeclared> {
  count: StrictAccessor<number>;
  from?: StrictAccessor<number | undefined>;
  fallback?: StrictChild;
  children: (index: number) => Child;
}

export interface SwitchProps extends CallSite<AsDeclared> {
  fallback?: StrictChild;
  children: StrictChild;
}

export interface LoadingProps extends CallSite<AsDeclared> {
  fallback?: StrictChild;
  on?: unknown;
  children: StrictChild;
}

export interface RevealProps extends CallSite<AsDeclared> {
  order?: StrictAccessor<"sequential" | "together" | "natural" | undefined>;
  collapsed?: StrictAccessor<boolean | undefined>;
  children: StrictChild;
}

export interface ErroredProps extends CallSite<AsDeclared> {
  fallback: Content | ((error: Accessor<Error>, reset: () => void) => Child);
  children: StrictChild;
}

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

/** A CELL-slot read: the value is called with no scope. */
function readValue(slot: unknown, origin: string): unknown {
  return readSlot(slot, origin);
}

function slotBlock(slot: unknown): Block<unknown> | null {
  return slot === null || slot === undefined ? null : (slot as Block<unknown>);
}

/**
 * A construct's child, decided as Solid 2.0's `Show` and `Match` decide it
 * (`solid/src/client/flow.ts`, `typeof child === "function" && child.length >
 * 0`): a function that declares a parameter is a render callback, called
 * untracked with the value, and any other child is content, a Cell included,
 * which the branch then reads live. A Block is a construction the compiler
 * made and is always run.
 */
function callSlot(slot: unknown, ...args: unknown[]): unknown {
  if (isBlock(slot)) return (slot as Block<unknown, unknown[]>)(...args);
  if (typeof slot === "function" && slot.length > 0) {
    return untrack(() => (slot as (...rest: unknown[]) => unknown)(...args));
  }
  return slot;
}

/** One child after `children()` has resolved it: never an array, never a function to call. */
export type ResolvedElement = Exclude<JSXElement, ArrayElement>;
export type ResolvedChildren = ResolvedElement | ResolvedElement[];
export type ChildrenReturn = Accessor<ResolvedChildren> & { toArray: () => ResolvedElement[] };

/**
 * Solid 2.0's `children()`: the children a component was handed, resolved, for
 * a component that has to inspect or iterate them rather than render them
 * through.
 *
 * A zero-arity function is called until it yields something else, which builds
 * a Block's nodes and reads a Cell; a Block is handed the memo as its scope, so
 * what it builds is owned here and disposed when the memo recomputes or its
 * owner goes. Arrays are flattened. A function that takes arguments is a render
 * callback and is returned untouched, as Solid's `flatten` does.
 *
 * Lazy, as Solid's is, so the children are built on the first read and not at
 * the call.
 */
export function children(fn: () => unknown): ChildrenReturn {
  const memo = internalMemo(() => resolveChildren(fn()), { lazy: true });
  return Object.assign(memo, {
    toArray: (): ResolvedElement[] => {
      const value = memo();
      if (Array.isArray(value)) return value;
      return value === null || value === undefined ? [] : [value];
    },
  });
}

function callChild(value: unknown): unknown {
  let at = value;
  while (typeof at === "function" && at.length === 0) {
    at = isBlock(at) ? (at as (scope: unknown) => unknown)(getOwner()) : (at as () => unknown)();
  }
  return at;
}

function resolveChildren(value: unknown): ResolvedChildren {
  const at = callChild(value);
  if (!Array.isArray(at)) return at as ResolvedElement;
  const out: ResolvedElement[] = [];
  const pending = flattenChildren(at, out);
  if (pending !== null) throw pending;
  return out;
}

/**
 * Every entry is resolved even when one is not ready yet, so the siblings that
 * are get built now; the first `NotReadyError` is rethrown afterwards.
 */
function flattenChildren(list: readonly unknown[], out: ResolvedElement[]): NotReadyError | null {
  let pending: NotReadyError | null = null;
  for (const entry of list) {
    try {
      const at = callChild(entry);
      if (Array.isArray(at)) {
        const nested = flattenChildren(at, out);
        pending ??= nested;
      } else {
        out.push(at as ResolvedElement);
      }
    } catch (error) {
      if (!(error instanceof NotReadyError)) throw error;
      pending ??= error;
    }
  }
  return pending;
}

export function Fragment(props: { children?: Child | Child[] }): JSXElement {
  // C8: a fragment is an ARRAY of its parts. Nothing builds a DocumentFragment.
  const kids = props.children;
  return (Array.isArray(kids) ? kids : [kids]) as unknown as JSXElement;
}

export function Show<T, K extends boolean = false>(props: ShowProps<T, K>): JSXElement {
  const value = internalMemo(() => readValue(props.when, "Show.when"));
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
  const content: Block<unknown> = (): unknown => {
    const current = untrack(value);
    return current ? callSlot(props.children, keyed ? current : value) : callSlot(props.fallback);
  };
  return branch(null, null, key, content);
}

export function For<T, K extends ForKeyed<T> = true>(
  props: ForProps<T, JSXElement> & CallSite<ForCallSite<T, K>>,
): JSXElement {
  // The arity rule — a Cell declares no parameter and a key function declares
  // one — is `each`'s own, so the carrier goes through unresolved. This adapter
  // and the compiler's spread lowering therefore reach the primitive with the
  // same argument rather than with two implementations of one rule.
  return each(
    null,
    null,
    props.each as Cell<readonly unknown[]>,
    props.keyed as Cell<unknown>,
    props.children as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  );
}

export function Repeat(props: RepeatProps): JSXElement {
  const from = (): number => (readValue(props.from, "Repeat.from") as number | undefined) ?? 0;
  const count = (): number => readValue(props.count, "Repeat.count") as number;
  // Solid 2.0's `Repeat` calls any function child with the index and renders
  // anything else as it is.
  const shifted: Block<unknown> = (index: unknown): unknown =>
    typeof props.children === "function"
      ? (props.children as (i: number) => unknown)((index as number) + from())
      : props.children;
  return each(
    null,
    null,
    count as Cell<number>,
    COUNT,
    shifted as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  );
}

/** C8-adjacent: `Match` is an identity function — `Switch` reads its props. */
export function Match<T, K extends boolean = false>(props: MatchProps<T, K>): JSXElement {
  return props as unknown as JSXElement;
}

export function Switch(props: SwitchProps): JSXElement {
  // The arms are read as DATA, and what arrives is not always the data: a
  // `<Match>` written after another is a Block that yields its descriptor, and
  // one behind a condition is a Cell. A Block is run once and kept, since what
  // it builds does not change; a Cell is read where the arms are chosen, so
  // the choice follows it.
  const yielded = new WeakMap<object, unknown>();
  const once = (slot: () => unknown): unknown => {
    if (!yielded.has(slot)) yielded.set(slot, untrack(slot));
    return yielded.get(slot);
  };
  const descriptors = (): unknown[] => {
    const out: unknown[] = [];
    const visit = (entry: unknown): void => {
      if (Array.isArray(entry)) {
        for (const item of entry) visit(item);
      } else if (typeof entry === "function") {
        visit(isBlock(entry) ? once(entry as () => unknown) : (entry as () => unknown)());
      } else {
        out.push(entry);
      }
    };
    visit(props.children);
    return out;
  };

  const arms = internalMemo(() => {
    const listed = descriptors() as Array<{
      when?: unknown;
      keyed?: unknown;
      children?: unknown;
    }>;
    for (let i = 0; i < listed.length; i++) {
      const child = listed[i];
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
  const key = internalMemo(() => {
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

  const body: Block<unknown> = (): unknown => {
    const found = untrack(arms);
    if (found === null) return callSlot(props.fallback);
    // A `Match` follows `Show`: non-keyed by default, so its children are
    // handed the narrowed ACCESSOR and the arm's content updates in place
    // across a value change. A keyed arm gets the value, and the generation
    // counter above is what rebuilds it.
    const keyed = readValue(found.match.keyed, "Match.keyed") === true;
    const narrowed = (): unknown => {
      const now = arms();
      return now === null ? undefined : now.value;
    };
    return callSlot(found.match.children, keyed ? found.value : narrowed);
  };

  return branch(null, null, key, body);
}

const UNSEEN: unique symbol = Symbol("unseen");

export function Loading(props: LoadingProps): JSXElement {
  return boundary(
    null,
    null,
    "loading",
    slotBlock(props.fallback),
    props.children as Block<unknown>,
    0,
    props.on === undefined ? undefined : () => readValue(props.on, "Loading.on"),
  );
}

export function Errored(props: ErroredProps): JSXElement {
  return boundary(
    null,
    null,
    "error",
    props.fallback as Block<unknown>,
    props.children as Block<unknown>,
  );
}

/**
 * `<NoHydration>` — an ISLAND: markup the server renders that the client never
 * hydrates.
 *
 * The compiler LOWERS this to `island(parent, anchor, block, flags)`, so this
 * function exists for two reasons only: the authoring surface has to typecheck,
 * and an un-compiled consumer has to get something that works. That is the same
 * arrangement `Portal` and `Show` are in.
 *
 * Solid's is `NoHydration` too, and it is deliberately NOT one of the ten
 * control-flow constructs: it decides who claims the markup, not what the page
 * contains.
 */
export function NoHydration(props: { children: unknown }): JSXElement {
  return island(null, null, props.children as Block<unknown>);
}

/**
 * Solid 2.0's `<Hydration>`: hydration again, inside a `<NoHydration>` zone.
 *
 * In a server render under `<NoHydration>` the children are rendered as a root
 * of their own, numbered under `id`, and their async values reach the page
 * again. The client claims that markup with a root of its own, by calling
 * `hydrate(fn, container, { renderId: id })` over the element holding it.
 * Everywhere else, the client included, the children pass through: a client
 * `<NoHydration>` builds nothing while hydrating, so there is nothing here to
 * re-enter.
 */
export function Hydration(props: { id?: string; children?: unknown }): JSXElement {
  const id = readValue(props.id, "Hydration.id") as string | undefined;
  const scope = hydrationScope(getOwner(), id ?? "");
  if (scope === null) return props.children as JSXElement;
  return runWithOwner(scope, () => settled(props.children)) as JSXElement;
}

/**
 * Run a Block to the value it renders, under the current owner. The string
 * backend calls a function it is handed under whatever owner is current when
 * it gets to it, which is past the scope a Block has to be built in.
 */
function settled(value: unknown): unknown {
  if (typeof value === "function")
    return settled((value as (owner: unknown) => unknown)(getOwner()));
  if (Array.isArray(value)) return value.map(settled);
  return value;
}

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
    () => readValue(props.mount, "Portal.mount") as Node | string | undefined,
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

/**
 * Reveal (Solid 2.0, replaces SuspenseList) — a `provide`, which is one of O1's
 * six scope creators. It coordinates how descendant `Loading` boundaries reveal
 * their content and owns no range of its own.
 */
export function Reveal(props: RevealProps): JSXElement {
  return reveal(
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
 * The whole of it is a memo over the import, and every mechanism it needs
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
/** What `lazy` returns: the component's own call signature, and the three probes. */
export type LazyComponent<T> = T & {
  preload: () => Promise<void>;
  ready: () => void;
  loaded: () => boolean;
};

export function lazy<T extends (props: never) => unknown>(
  load: () => Promise<{ default: T }>,
  pick?: undefined,
  moduleUrl?: string,
): LazyComponent<T>;
export function lazy<M, T extends (props: never) => unknown>(
  load: () => Promise<M>,
  pick: (module: M) => T,
  moduleUrl?: string,
): LazyComponent<T>;
export function lazy<M extends Record<string, unknown>, K extends keyof M & string>(
  load: () => Promise<M>,
  options: { export: K },
  moduleUrl?: string,
): LazyComponent<M[K]>;
// `P` is the props type of the component this RETURNS, which is the only
// thing a caller can say about a module whose export is not typed as a component.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function lazy<P = unknown>(
  load: () => Promise<Record<string, unknown>>,
  pick?: ((module: Record<string, unknown>) => unknown) | { export?: string },
  moduleUrl?: string,
): LazyComponent<(props: P) => JSXElement>;
export function lazy(
  load: () => Promise<Record<string, unknown>>,
  which?: ((module: Record<string, unknown>) => unknown) | { export?: string },
  moduleUrl?: string,
): LazyComponent<(props: unknown) => JSXElement> {
  const name = typeof which === "object" ? (which.export ?? "default") : "default";
  const pick =
    typeof which === "function" ? which : (module: Record<string, unknown>) => module[name];
  let cell: Cell<unknown> | null = null;
  let here = false;
  const resolved = (): Cell<unknown> =>
    // Under a root of its own that nothing disposes: a memo with no owner is
    // released whenever nothing is reading it, and the next read would import
    // again.
    (cell ??= runWithOwner(null, () =>
      createRoot(() => createMemo(async () => pick(await load()))),
    ));

  const component = (props: unknown): JSXElement => {
    // Before the read, which throws while the module is on its way: the page
    // needs the module's assets whether or not this render waits for them.
    if (moduleUrl !== undefined) reportModule(moduleUrl);
    const Loaded = resolved()() as (props: unknown) => JSXElement;
    here = true;
    return Loaded(props);
  };

  // Warms the SAME cell. `resolve` awaits the cell's first settled value rather
  // than calling `load()` again — a second call is a second fetch on any loader
  // that is not itself memoised, and it made `preload()` import twice.
  component.preload = async (): Promise<void> => {
    await resolve(resolved());
    here = true;
  };

  /**
   * Whether the module is already here, answered WITHOUT awaiting.
   *
   * A caller that must not defer when there is nothing to defer for needs a
   * synchronous answer, and `preload()` cannot give one: awaiting an
   * already-settled cell still costs a microtask, and a router that awaits it
   * on every navigation makes every commit asynchronous — including the
   * navigations that had no chunk to fetch. TanStack's `loadRouteChunk` returns
   * `undefined` for a chunk that is already loaded, for the same reason.
   *
   * Only ever true once the module has actually been read, so a false answer
   * costs a wait that was going to happen anyway.
   */
  component.loaded = (): boolean => here;

  /**
   * A TRACKED read of the module, for a caller that must subscribe to it.
   *
   * Invoking the component reads the cell too, but a caller that invokes it
   * inside `untrack` establishes no dependency — so the `NotReadyError` parks a
   * boundary that the module landing can never wake. `@barqjs/router` is exactly
   * that caller: component bodies run untracked on purpose, so a route reading
   * `props.params()` does not resubscribe its whole subtree. Measured before
   * this existed: navigating to a code-split route
   * showed its fallback forever, and every route a file-based table generates is
   * code-split.
   *
   * Throws `NotReadyError` until the module is here, which is what a boundary
   * above it is for.
   */
  component.ready = (): void => {
    resolved()();
    here = true;
  };

  return component;
}

/** What `lazyModule` returns: the cached import, callable, with its two probes. */
export type LazyModule<T> = (() => Promise<T>) & {
  preload: () => Promise<T>;
  peek: () => T | undefined;
};

/**
 * Solid 2.0's `lazyModule`: a cached dynamic import for a module that is not a
 * component. Calling it or `preload()` starts the import once and answers the
 * same promise; `peek()` answers the module once it has landed.
 *
 * A failed import is not cached, so the next call imports again: the platform
 * re-fetches a failed dynamic import, and a retry expects it to.
 */
export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let pending: Promise<T> | undefined;
  let landed: T | undefined;
  const read = (): Promise<T> => {
    if (pending !== undefined) return pending;
    const current = load();
    pending = current;
    current.then(
      (module) => {
        landed = module;
      },
      () => {
        if (pending === current) pending = undefined;
      },
    );
    return current;
  };
  return Object.assign(read, { preload: read, peek: (): T | undefined => landed });
}
