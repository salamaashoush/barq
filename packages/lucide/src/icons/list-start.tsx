import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListStart(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 5h6" />
      <path d="M3 12h13" />
      <path d="M3 19h13" />
      <path d="m16 8-3-3 3-3" />
      <path d="M21 19V7a2 2 0 0 0-2-2h-6" />
    </svg>
  );
}
