import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BetweenHorizontalStart(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="13" height="7" x="8" y="3" rx="1" />
      <path d="m2 9 3 3-3 3" />
      <rect width="13" height="7" x="8" y="14" rx="1" />
    </svg>
  );
}
