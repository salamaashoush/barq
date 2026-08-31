import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GripHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="9" r="1" />
      <circle cx="19" cy="9" r="1" />
      <circle cx="5" cy="9" r="1" />
      <circle cx="12" cy="15" r="1" />
      <circle cx="19" cy="15" r="1" />
      <circle cx="5" cy="15" r="1" />
    </svg>
  );
}
