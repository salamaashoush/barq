import { atoms, css } from "@barqjs/css";

// A logical property, which a minifier writes as `left` and `right` under
// `:lang()` below its support for them.
export const start = atoms({ insetInlineStart: 0 });

export const shifted = css`
  position: absolute;
  inset-inline-start: 4px;
`;
