import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LaptopMinimal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="12" x="3" y="4" rx="2" ry="2" />
      <line x1="2" x2="22" y1="20" y2="20" />
    </svg>
  );
}
