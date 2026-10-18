/**
 * The JSX types for a custom renderer, for `jsxImportSource`.
 *
 * An intrinsic element is whatever tag the host creates, so every tag takes
 * any property. A renderer package that knows its tags declares its own
 * `IntrinsicElements` in a `jsx-runtime` of its own and points
 * `jsxImportSource` there instead.
 */

import { Fragment } from "@barqjs/core";
import type { JSXElement } from "@barqjs/core";

export { Fragment };

export namespace JSX {
  export type Element = JSXElement;

  export interface ElementChildrenAttribute {
    children: unknown;
  }

  export interface IntrinsicAttributes {
    ref?: unknown;
  }

  export interface IntrinsicProps {
    children?: unknown;
    ref?: unknown;
    [property: string]: unknown;
  }

  export interface IntrinsicElements {
    [tag: string]: IntrinsicProps;
  }
}
