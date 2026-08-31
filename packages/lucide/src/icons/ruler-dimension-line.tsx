import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RulerDimensionLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 15v-3" />
      <path d="M14 15v-3" />
      <path d="M18 15v-3" />
      <path d="M2 8V4" />
      <path d="M22 6H2" />
      <path d="M22 8V4" />
      <path d="M6 15v-3" />
      <rect x="2" y="12" width="20" height="8" rx="2" />
    </svg>
  );
}
