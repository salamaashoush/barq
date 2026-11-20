import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RussianRuble(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 16h6" />
      <path d="M7 20V5a1 1 0 011-1h6a4 4 0 010 8H4" />
    </svg>
  );
}
