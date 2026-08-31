import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Microchip(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 12h4" />
      <path d="M10 17h4" />
      <path d="M10 7h4" />
      <path d="M18 12h2" />
      <path d="M18 18h2" />
      <path d="M18 6h2" />
      <path d="M4 12h2" />
      <path d="M4 18h2" />
      <path d="M4 6h2" />
      <rect x="6" y="2" width="12" height="20" rx="2" />
    </svg>
  );
}
