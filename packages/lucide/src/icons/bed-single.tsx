import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BedSingle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" />
      <path d="M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <path d="M3 18h18" />
    </svg>
  );
}
