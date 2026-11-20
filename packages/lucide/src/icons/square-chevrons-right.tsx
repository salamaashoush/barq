import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareChevronsRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 15L17 12L14 9" />
      <path d="M8 15L11 12L8 9" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
