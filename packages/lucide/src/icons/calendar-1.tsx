import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Calendar1(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 13h1v4" />
      <path d="M16 2v3" />
      <path d="M3 9h18" />
      <path d="M8 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
