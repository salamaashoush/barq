import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RouteArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m18 22 3-3-3-3" />
      <path d="M9 5h8.5a1 1 0 010 7h-11a1 1 0 000 7H21" />
      <circle cx="6" cy="5" r="3" />
    </svg>
  );
}
