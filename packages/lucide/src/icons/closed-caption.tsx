import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ClosedCaption(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 9.17a3 3 0 1 0 0 5.66" />
      <path d="M17 9.17a3 3 0 1 0 0 5.66" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </svg>
  );
}
