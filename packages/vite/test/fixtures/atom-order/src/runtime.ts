import { css } from "@barqjs/css";

// Read at run time, so the compiler leaves the block to the runtime, which
// registers it in the document rather than in a built stylesheet.
const tone = document.documentElement.dataset.tone ?? "purple";

export const evaluated = css`
  color: ${tone};
`;
