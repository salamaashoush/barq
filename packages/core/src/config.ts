/**
 * The types a JSX call site writes against.
 *
 * There is one mode. `@barqjs/compiler` wraps a bare value in a thunk on the
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
export type Incoming<P> = { [K in keyof P]: Accessor<P[K]> };

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
