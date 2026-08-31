import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BetweenHorizontalEnd(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="13" height="7" x="3" y="3" rx="1" />
      <path d="m22 15-3-3 3-3" />
      <rect width="13" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}
