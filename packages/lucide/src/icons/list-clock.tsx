import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListClock(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 13v2.2l1.6 1" />
      <path d="M3 12h3.458" />
      <path d="M3 19h3.832" />
      <path d="M3 5h18" />
      <circle cx="16" cy="15" r="6" />
    </svg>
  );
}
