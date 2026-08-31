import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SignalLow(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
    </svg>
  );
}
