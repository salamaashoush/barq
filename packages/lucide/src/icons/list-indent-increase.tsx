import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListIndentIncrease(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 5H11" />
      <path d="M21 12H11" />
      <path d="M21 19H11" />
      <path d="m3 8 4 4-4 4" />
    </svg>
  );
}
