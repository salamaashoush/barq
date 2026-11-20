import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowRightToLine(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17 12H3" />
      <path d="m11 18 6-6-6-6" />
      <path d="M21 5v14" />
    </svg>
  );
}
