import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TableProperties(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 3v18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M21 9H3" />
      <path d="M21 15H3" />
    </svg>
  );
}
