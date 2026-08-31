import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DecimalsArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 18h10" />
      <path d="m17 21 3-3-3-3" />
      <path d="M3 11h.01" />
      <rect x="15" y="3" width="5" height="8" rx="2.5" />
      <rect x="6" y="3" width="5" height="8" rx="2.5" />
    </svg>
  );
}
