import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Cylinder(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    </svg>
  );
}
