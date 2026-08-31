import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Navigation2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <polygon points="12 2 19 21 12 17 5 21 12 2" />
    </svg>
  );
}
