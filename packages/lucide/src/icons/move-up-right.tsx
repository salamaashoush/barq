import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveUpRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 5H19V11" />
      <path d="M19 5L5 19" />
    </svg>
  );
}
