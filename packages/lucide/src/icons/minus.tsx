import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Minus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 12h14" />
    </svg>
  );
}
