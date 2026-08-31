import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function EqualNot(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <line x1="5" x2="19" y1="9" y2="9" />
      <line x1="5" x2="19" y1="15" y2="15" />
      <line x1="19" x2="5" y1="5" y2="19" />
    </svg>
  );
}
