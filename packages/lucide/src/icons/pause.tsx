import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Pause(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </svg>
  );
}
