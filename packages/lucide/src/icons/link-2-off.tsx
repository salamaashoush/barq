import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Link2Off(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 17H7A5 5 0 0 1 7 7" />
      <path d="M15 7h2a5 5 0 0 1 4 8" />
      <line x1="8" x2="12" y1="12" y2="12" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
