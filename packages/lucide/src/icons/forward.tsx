import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Forward(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15 17 5-5-5-5" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </svg>
  );
}
