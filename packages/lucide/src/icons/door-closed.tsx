import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DoorClosed(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 12h.01" />
      <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
      <path d="M2 20h20" />
    </svg>
  );
}
