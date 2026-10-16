import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LayoutArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <path d="M3 18h18" />
      <path d="m18 21 3-3-3-3" />
    </svg>
  );
}
