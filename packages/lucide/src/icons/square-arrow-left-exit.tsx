import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowLeftExit(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 12H3" />
      <path d="M3 17.67V19a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v1.33" />
      <path d="m7 8-4 4 4 4" />
    </svg>
  );
}
