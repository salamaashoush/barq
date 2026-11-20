import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleChevronsRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 15L17 12L14 9" />
      <path d="M8 15L11 12L8 9" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
