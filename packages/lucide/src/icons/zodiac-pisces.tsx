import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacPisces(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M19 21a15 15 0 0 1 0-18" />
      <path d="M20 12H4" />
      <path d="M5 3a15 15 0 0 1 0 18" />
    </svg>
  );
}
