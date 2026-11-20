import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CirclePersonArmsSpread(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m15 17-3-3" />
      <path d="M8 10s2 1 4 1 4-1 4-1" />
      <path d="m9 17 3-3v-3" />
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="7" r=".5" fill="currentColor" />
    </svg>
  );
}
