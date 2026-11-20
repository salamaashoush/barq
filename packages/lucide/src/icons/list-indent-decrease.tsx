import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListIndentDecrease(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 5H11" />
      <path d="M21 12H11" />
      <path d="M21 19H11" />
      <path d="m7 8-4 4 4 4" />
    </svg>
  );
}
