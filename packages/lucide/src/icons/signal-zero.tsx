import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SignalZero(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 20h.01" />
    </svg>
  );
}
