import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignStart(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 5H3" />
      <path d="M15 12H3" />
      <path d="M17 19H3" />
    </svg>
  );
}
