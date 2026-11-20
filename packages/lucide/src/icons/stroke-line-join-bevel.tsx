import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineJoinBevel(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 21v-2.002" />
      <path d="M3 3h8.002a2.4 2.4 0 011.704.706l7.588 7.588A2.4 2.4 0 0121 12.998V21" />
      <path d="M5 13H3" />
      <path d="M9 13h1a1 1 0 011 1v1" />
    </svg>
  );
}
