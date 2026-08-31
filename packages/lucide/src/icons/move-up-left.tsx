import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveUpLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 11V5H11" />
      <path d="M5 5L19 19" />
    </svg>
  );
}
