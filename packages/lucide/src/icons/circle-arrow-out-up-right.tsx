import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleArrowOutUpRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 12A10 10 0 1 1 12 2" />
      <path d="M22 2 12 12" />
      <path d="M16 2h6v6" />
    </svg>
  );
}
