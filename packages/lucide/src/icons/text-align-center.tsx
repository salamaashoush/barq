import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignCenter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 5H3" />
      <path d="M17 12H7" />
      <path d="M19 19H5" />
    </svg>
  );
}
