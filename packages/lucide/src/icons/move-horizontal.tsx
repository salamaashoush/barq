import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </svg>
  );
}
