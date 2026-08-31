import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Grid3x2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 3v18" />
      <path d="M3 12h18" />
      <path d="M9 3v18" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
