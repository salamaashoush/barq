import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ClockCheck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21.95 13a10 10 0 1 0-8.685 8.92" />
      <path d="M12 6v6l4 2" />
      <path d="m16 19 2 2 4-4" />
    </svg>
  );
}
