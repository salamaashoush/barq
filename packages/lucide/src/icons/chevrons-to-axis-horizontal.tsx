import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsToAxisHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m16 21-4-4-4 4" />
      <path d="m16 3-4 4-4-4" />
      <path d="M22 12H2" />
    </svg>
  );
}
