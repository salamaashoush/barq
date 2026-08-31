import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundKey(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M19 11v6" />
      <path d="M19 13h2" />
      <path d="M2 21a8 8 0 0 1 12.868-6.349" />
      <circle cx="10" cy="8" r="5" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  );
}
