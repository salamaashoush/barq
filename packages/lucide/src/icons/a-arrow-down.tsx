import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AArrowDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m14 12 4 4 4-4" />
      <path d="M18 16V7" />
      <path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16" />
      <path d="M3.304 13h6.392" />
    </svg>
  );
}
