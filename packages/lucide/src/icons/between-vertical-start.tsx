import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BetweenVerticalStart(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="7" height="13" x="3" y="8" rx="1" />
      <path d="m15 2-3 3-3-3" />
      <rect width="7" height="13" x="14" y="8" rx="1" />
    </svg>
  );
}
