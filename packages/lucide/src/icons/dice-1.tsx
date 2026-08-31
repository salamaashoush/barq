import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Dice1(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <path d="M12 12h.01" />
    </svg>
  );
}
