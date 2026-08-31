import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SignalMedium(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
    </svg>
  );
}
