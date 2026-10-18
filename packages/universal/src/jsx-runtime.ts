/**
 * The JSX types for a custom renderer, for `jsxImportSource`.
 *
 * An intrinsic element is whatever tag the host creates, so every tag takes
 * any property. A renderer package that knows its tags declares its own
 * `IntrinsicElements` in a `jsx-runtime` of its own and points
 * `jsxImportSource` there instead.
 */

import { Fragment } from "@barqjs/core";
import type { Accessor, CallSite, JSXElement, StrictAccessor } from "@barqjs/core";
import type { AsDeclared, DeclaredCallSite } from "@barqjs/core/internal";

export { Fragment };

export namespace JSX {
  export type Element = JSXElement;

  /**
   * A component's body reads every prop as a Cell, and its call site writes
   * values: `<For each={rows()}>` against `each: Cell<…>`. The same mapping
   * `@barqjs/web`'s namespace makes, so a component typechecks the same under
   * either `jsxImportSource`, and a props type that declares its call site
   * through `CallSite` (the flow components, the intrinsic elements) is
   * checked against that instead.
   */
  export type LibraryManagedAttributes<C, P> =
    DeclaredCallSite<P> extends AsDeclared
      ? P
      : unknown extends DeclaredCallSite<P>
        ? C extends (scope: never, props: infer Q) => unknown
          ? unknown extends Q
            ? Outgoing<P>
            : Q
          : Outgoing<P>
        : DeclaredCallSite<P>;

  /**
   * A zero-argument prop is an accessor and its call site may write the value.
   * A prop that declares parameters is a slot (a row callback, a handler) and
   * stays as declared, so its parameters are still inferred.
   */
  type Outgoing<Q> = {
    [K in keyof Q]: [NonNullable<Q[K]>] extends [never]
      ? Q[K]
      : NonNullable<Q[K]> extends () => infer R
        ? StrictAccessor<R>
        : OutgoingMember<Q[K]>;
  };

  type OutgoingMember<M> = M extends () => infer R ? OutgoingValue<R> | Accessor<R> : M;

  type OutgoingValue<R> = R extends (...args: never[]) => infer X
    ? never[] extends Parameters<R>
      ? Accessor<X>
      : R
    : R;

  export interface ElementChildrenAttribute {
    children: unknown;
  }

  export interface IntrinsicAttributes {
    ref?: unknown;
  }

  export interface IntrinsicProps extends CallSite<AsDeclared> {
    children?: unknown;
    ref?: unknown;
    [property: string]: unknown;
  }

  export interface IntrinsicElements {
    [tag: string]: IntrinsicProps;
  }
}
