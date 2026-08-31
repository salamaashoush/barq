import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ellipse(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <ellipse cx="12" cy="12" rx="10" ry="6" />
    </svg>
  );
}
