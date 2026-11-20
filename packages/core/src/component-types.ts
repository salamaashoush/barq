/**
 * The types a component is written against, none of which names a platform.
 */

import type { Child, JSXElement } from "./types.ts";

/**
 * Accessor type - a function that returns a value reactively
 */
export type Accessor<T> = () => T;

/**
 * Setter type - a function that updates a signal value
 */
export type Setter<T> = {
  (value: T): void;
  (fn: (prev: T) => T): void;
};

/**
 * FunctionMaybe - value can be static or a reactive accessor
 * This is the core pattern for reactive attributes
 */
export type FunctionMaybe<T> = T | Accessor<T>;

/**
 * MaybeAccessor - alias for FunctionMaybe (SolidJS naming)
 */
export type MaybeAccessor<T> = FunctionMaybe<T>;

/**
 * The four shapes a component declares, as its body reads them: values. The
 * compiler writes the call that reads each prop's Cell, so `props.title` is a
 * `string` where the declaration says `string`.
 *
 * Code the compiler does not rewrite, a hook in a `.ts` file or a helper with
 * a lowercase name, holds the record itself and declares `Incoming<P>`.
 */
export type PropsWithChildren<P = NoProps> = P & { children?: Child };

/**
 * ParentProps - alias for PropsWithChildren (SolidJS naming)
 */
export type ParentProps<P = NoProps> = PropsWithChildren<P>;

/**
 * VoidProps - props for components that don't accept children
 */
export type VoidProps<P = NoProps> = P & { children?: never };

/**
 * FlowProps - props for components that must have children
 */
export type FlowProps<P = NoProps, C = Child> = P & { children: C };

/** A props declaration with nothing in it, which intersects cleanly with `children`. */
type NoProps = object;

/** A component, given the props its caller writes and its body reads. */
export type Component<P = NoProps> = (props: P) => JSXElement;

/** A component that takes no children. */
export type VoidComponent<P = NoProps> = (props: VoidProps<P>) => JSXElement;

/** A component that may take children. */
export type ParentComponent<P = NoProps> = (props: ParentProps<P>) => JSXElement;

/** A component that must be given children, a callback or content as `C` says. */
export type FlowComponent<P = NoProps, C = Child> = (props: FlowProps<P, C>) => JSXElement;

/**
 * Ref - ref callback or object type
 */
export type Ref<T> = T | ((el: T) => void) | { current: T | null };

/**
 * RefCallback - just the callback form of ref
 */
export type RefCallback<T> = (el: T) => void;

/**
 * RefObject - just the object form of ref
 */
export type RefObject<T> = { current: T | null };

/**
 * A `bind:` target: a signal, which is the `[read, write]` pair `createSignal`
 * returns.
 *
 * Structural rather than `Signal<T>` so that any pair is admitted — a derived
 * signal, an accessor put together with a setter that validates. A memo and a
 * bare accessor are not pairs, which is the whole point: the runtime answers
 * those with `BIND_TARGET_NOT_WRITABLE`, and this is the same refusal one step
 * earlier.
 *
 * The write half is declared as a method so it is checked bivariantly: one
 * `bind:value` slot serves a text input and a number input, and a setter for
 * `string` has to fit a slot that also admits `number`.
 */
export type Bindable<T> = readonly [read: () => T, write: { write(value: T): unknown }["write"]];
