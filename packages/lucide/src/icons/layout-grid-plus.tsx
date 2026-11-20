import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LayoutGridPlus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 18h6" />
      <path d="M18 15v6" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="3" width="7" height="7" rx="1" />
    </svg>
  );
}
