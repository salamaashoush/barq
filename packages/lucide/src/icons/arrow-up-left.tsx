import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 17V7h10" />
      <path d="M17 17 7 7" />
    </svg>
  );
}
