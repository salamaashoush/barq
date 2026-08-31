import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListMusic(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M11 19H3" />
      <path d="M21 16V5" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
