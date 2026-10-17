/**
 * What a component tree renders, without naming the platform that renders it.
 *
 * The concrete value belongs to the renderer: a DOM `Node` in the browser, an
 * object of a custom host elsewhere. Core only needs to tell such a value apart
 * from a function, which is a Cell or a Block and is called rather than placed.
 */
export type RenderedElement = object & {
  readonly call?: never;
  readonly apply?: never;
  readonly bind?: never;
};

/**
 * A function child is a `Cell<Child>` or a `Block<Child>` and the two are
 * not distinguished here — a Cell ignores the scope a Block needs, so both are
 * called the same way and both belong in the same position.
 */
export type Child =
  | RenderedElement
  | string
  | number
  | boolean
  | null
  | undefined
  | ((...args: never[]) => Child)
  | Child[];

export type Props = Record<string, unknown> & { children?: Child | Child[] };

/**
 * A fragment: JSX elements, and the CELLS among them.
 *
 * A member that is a function is a live hole rather than a value, which is what
 * `<>{() => cond() ? <a/> : <b/>}</>` compiles to — an array whose only member
 * is a Cell. `insert` has always placed one; the type said otherwise, so the
 * capability was reachable from the runtime and not from typed code.
 */
export type ArrayElement = (JSXElement | (() => JSXElement))[];

/**
 * JSXElement type that components can return
 * Matches SolidJS's JSX.Element type exactly
 * The (string & {}) pattern allows string literals while avoiding widening
 */
export type JSXElement =
  | RenderedElement
  | ArrayElement
  | (string & {})
  | number
  | boolean
  | null
  | undefined;

export type { JSXElement as Element };
