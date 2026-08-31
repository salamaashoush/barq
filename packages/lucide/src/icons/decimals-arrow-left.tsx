import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DecimalsArrowLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m13 21-3-3 3-3" />
      <path d="M20 18H10" />
      <path d="M3 11h.01" />
      <rect x="6" y="3" width="5" height="8" rx="2.5" />
    </svg>
  );
}
