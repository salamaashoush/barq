/**
 * Named to assistive technology, drawn nowhere.
 *
 * `display: none` and `visibility: hidden` both take an element out of the
 * accessibility tree as well as out of the layout, which is the opposite of
 * what this is for. Clipping to nothing while staying in the flow is the only
 * arrangement every screen reader still reads.
 */

import { css } from "@barqjs/css";

import "../theme/layers.ts";

/**
 * `&&` on purpose. A layout rule of the same specificity, `<Field>`'s
 * `& > * { width: 100% }`, would otherwise be decided by which module the
 * bundler registered first and a screen-reader-only child would be drawn.
 * shadcn cancels that one rule by hand (`[&>.sr-only]:w-auto`); winning
 * outright needs no cancelling anywhere.
 */
export const srOnly = css`
  @layer barq.ui {
    && {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border-width: 0;
    }
  }
`;
