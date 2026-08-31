import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Minimize2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m14 10 7-7" />
      <path d="M20 10h-6V4" />
      <path d="m3 21 7-7" />
      <path d="M4 14h6v6" />
    </svg>
  );
}
