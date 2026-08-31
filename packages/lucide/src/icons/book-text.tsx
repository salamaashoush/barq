import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BookText(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M8 11h8" />
      <path d="M8 7h6" />
    </svg>
  );
}
