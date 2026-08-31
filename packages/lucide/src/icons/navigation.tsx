import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Navigation(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}
