import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDown01(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <rect x="15" y="4" width="4" height="6" ry="2" />
      <path d="M17 20v-6h-2" />
      <path d="M15 20h4" />
    </svg>
  );
}
