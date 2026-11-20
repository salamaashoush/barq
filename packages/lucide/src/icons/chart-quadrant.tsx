import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartQuadrant(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 3v18" />
      <path d="M3 12h18" />
      <path d="M3 3v16a2 2 0 002 2h16" />
      <circle cx="17.5" cy="5.5" r="0.5" fill="currentColor" />
      <circle cx="19.5" cy="16.5" r="0.5" fill="currentColor" />
      <circle cx="7.5" cy="16.5" r="0.5" fill="currentColor" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
