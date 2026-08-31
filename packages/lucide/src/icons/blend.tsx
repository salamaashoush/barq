import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Blend(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="15" cy="9" r="7" />
      <circle cx="9" cy="15" r="7" />
    </svg>
  );
}
