/**
 * The types a JSX call site writes against.
 *
 * There is one mode. The compiler wraps a bare value in a thunk on the
 * way through, so `<Show when={count() > 5}>` and `<For each={items()}>` are
 * what a caller writes and what the emitted code hands the construct.
 *
 * This used to be an OPT-IN — `declare global { namespace Barq { interface
 * Config { COMPILER_MODE: true } } }` in a `barq.d.ts` — from when a caller
 * could plausibly run the JSX runtime uncompiled and had to write the thunks by
 * hand. Nothing does: every package here and every `create-barq` template
 * declared the flag, nine copies of one file saying yes to a question with no
 * other answer, and a package that forgot it got type errors that described a
 * mode it was not in.
 */

import type { Child } from "./dom.ts";

/** A deferred read: the fundamental reactive primitive. */
export type Accessor<T> = () => T;

/**
 * What a control-flow prop accepts at a JSX call site.
 *
 * A value or an accessor: the compiler wraps the value, and a caller who
 * already has an accessor passes it through.
 *
 * @example
 * ```tsx
 * <Show when={count() > 5}>
 * <Match when={mode() === "edit"}>
 * ```
 */
export type StrictAccessor<T> = T | Accessor<T>;

/**
 * What a component BODY sees, given the props its CALLER declares.
 *
 * The two directions are not the same type and conflating them is why an
 * application could not annotate a component at all. `StrictAccessor` is the
 * OUTGOING side — what a JSX call site may write, which is a value or an
 * accessor because the compiler wraps a bare value in a thunk for you.
 * Incoming is the CALLEE side, and there the compiler has already done that: a
 * prop that is present is a Cell and is called at the use site. So this is
 * `Accessor` unconditionally.
 *
 * Optionality is preserved rather than stripped, because it is load-bearing:
 * a prop the caller omitted is not an own property, so the read is `?.()` and
 * the default lives beside it.
 *
 * @example
 * ```tsx
 * export function Button(props: Incoming<{ variant?: "primary" | "danger" }>) {
 *   const variant = () => props.variant?.() ?? "primary";
 * }
 * ```
 */
export type Incoming<P> = {
  [K in keyof P]: K extends "children" ? IncomingChildren<P[K]> : Accessor<P[K]>;
};

/**
 * `children` is the one prop that crosses as a Block rather than behind a
 * Cell, so a children function that requires arguments reaches the body as
 * written and is called with them: `props.children(item)`. Everything else in
 * the slot is read like any other prop.
 */
export type IncomingChildren<C> =
  | ChildrenCallback<C>
  | ([Exclude<ChildrenContent<C>, undefined>] extends [never]
      ? never
      : Accessor<ChildrenContent<C>>);

/** The members of a children type that cannot be called with no arguments. */
type ChildrenCallback<C> = C extends (...args: never[]) => unknown
  ? C extends () => unknown
    ? never
    : C
  : never;

/**
 * Every other member. Decided by the same two tests rather than by excluding
 * the callbacks: against a callback that mentions a type parameter, `Child`'s
 * own function member is neither provably the same nor provably different, and
 * the whole type would stay unresolved inside a generic component.
 */
type ChildrenContent<C> = C extends (...args: never[]) => unknown
  ? C extends () => unknown
    ? C
    : never
  : C;

declare const CALL_SITE: unique symbol;
declare const AS_DECLARED: unique symbol;

/**
 * Declares what a JSX call site of a component writes, for the component whose
 * attributes are not `Incoming`'s inverse: `S` is that type, or `AsDeclared`
 * when the props are already written the way a call site writes them.
 *
 * The flow components need it. `<For>` picks its row signature from `keyed`,
 * and a type parameter standing alone in a prop is not inferred through the
 * mapped type that widens `Incoming` props back to values. The property is
 * never set.
 */
export interface CallSite<S> {
  readonly [CALL_SITE]?: S;
}

/** The `CallSite` argument that means the props type itself. */
export type AsDeclared = typeof AS_DECLARED;

/** What a props type declares through `CallSite`, or `unknown` when it declares nothing. */
export type DeclaredCallSite<P> = P extends CallSite<infer S> ? S : unknown;

/**
 * The same, for a list prop: `For.each`, `Repeat.count`.
 *
 * The falsy members are the empty list a caller writes as `items && items` or
 * as a resource that has not landed, and a construct treats each as no rows
 * rather than as a mistake.
 */
export type StrictArrayAccessor<T> =
  | readonly T[]
  | T[]
  | undefined
  | null
  | false
  | Accessor<readonly T[] | T[] | undefined | null | false>;

/**
 * The children slot of a construct that builds them lazily.
 *
 * `<Show when={visible}><Content /></Show>`: the compiler emits the Block, and
 * a caller holding one already passes it through.
 */
export type StrictChild = Child | Accessor<Child>;
