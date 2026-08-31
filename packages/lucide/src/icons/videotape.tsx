import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Videotape(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M2 8h20" />
      <circle cx="8" cy="14" r="2" />
      <path d="M8 12h8" />
      <circle cx="16" cy="14" r="2" />
    </svg>
  );
}
