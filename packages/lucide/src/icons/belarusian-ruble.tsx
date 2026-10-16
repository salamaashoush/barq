import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BelarusianRuble(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 16 L13 16" />
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7" />
    </svg>
  );
}
