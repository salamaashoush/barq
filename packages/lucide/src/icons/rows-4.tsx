import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Rows4(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M21 7.5H3" />
      <path d="M21 12H3" />
      <path d="M21 16.5H3" />
    </svg>
  );
}
