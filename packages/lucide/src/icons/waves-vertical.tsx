import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function WavesVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2q2 2.5 0 5t0 5 0 5 0 5" />
      <path d="M19 2q2 2.5 0 5t0 5 0 5 0 5" />
      <path d="M5 2q2 2.5 0 5t0 5 0 5 0 5" />
    </svg>
  );
}
