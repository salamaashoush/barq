import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function IndianRupee(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m14 20-8-8h4c5.333 0 5.333-8 0-8" />
      <path d="M6 4h12" />
      <path d="M6 8h12" />
    </svg>
  );
}
