import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignEnd(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 5H3" />
      <path d="M21 12H9" />
      <path d="M21 19H7" />
    </svg>
  );
}
