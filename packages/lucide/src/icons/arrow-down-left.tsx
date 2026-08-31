import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 7 7 17" />
      <path d="M17 17H7V7" />
    </svg>
  );
}
