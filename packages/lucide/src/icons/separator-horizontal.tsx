import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SeparatorHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m16 16-4 4-4-4" />
      <path d="M3 12h18" />
      <path d="m8 8 4-4 4 4" />
    </svg>
  );
}
