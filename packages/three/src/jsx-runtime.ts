/**
 * The JSX types for files compiled for this renderer, for
 * `jsxImportSource: "@barqjs/three"`: every three class is a tag
 * (`<mesh position={[1, 2, 3]} onClick={(e) => e.object}>`), and components
 * typecheck as they do under `@barqjs/web`.
 */

import { Fragment } from "@barqjs/core";
import type { Accessor, JSXElement, StrictAccessor } from "@barqjs/core";
import type { AsDeclared, DeclaredCallSite } from "@barqjs/core/internal";

import type { ThreeElements } from "./three-types.ts";

export { Fragment };

export namespace JSX {
  export type Element = JSXElement;

  /** The call-site mapping `@barqjs/universal`'s namespace makes, for components. */
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

  export interface IntrinsicElements extends ThreeElements {}
}
