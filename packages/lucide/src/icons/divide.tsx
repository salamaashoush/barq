import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Divide(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="6" r="1" />
      <line x1="5" x2="19" y1="12" y2="12" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  );
}
