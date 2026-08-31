import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerUpLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      <path d="M9 14 4 9l5-5" />
    </svg>
  );
}
