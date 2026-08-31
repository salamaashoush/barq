import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Album(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <polyline points="11 3 11 11 14 8 17 11 17 3" />
    </svg>
  );
}
