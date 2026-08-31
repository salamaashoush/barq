import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18 8L22 12L18 16" />
      <path d="M2 12H22" />
    </svg>
  );
}
