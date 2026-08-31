import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Torus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <ellipse cx="12" cy="11" rx="3" ry="2" />
      <ellipse cx="12" cy="12.5" rx="10" ry="8.5" />
    </svg>
  );
}
