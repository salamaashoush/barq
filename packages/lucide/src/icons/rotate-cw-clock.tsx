import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RotateCwClock(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 7v5l4 2" />
      <path d="M16 8h5V3" />
      <path d="m21 8-2.3-2.3A9.7 9.7 0 0012 3a9 9 0 109 9" />
    </svg>
  );
}
