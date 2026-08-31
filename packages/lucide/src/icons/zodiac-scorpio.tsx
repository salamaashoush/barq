import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacScorpio(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 19V5.5a1 1 0 0 1 5 0V17a2 2 0 0 0 2 2h5l-3-3" />
      <path d="m22 19-3 3" />
      <path d="M5 19V5.5a1 1 0 0 1 5 0" />
      <path d="M5 5.5A2.5 2.5 0 0 0 2.5 3" />
    </svg>
  );
}
