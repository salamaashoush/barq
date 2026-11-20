import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsToAxisDashedHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="m16 21-4-4-4 4" />
      <path d="m16 3-4 4-4-4" />
      <path d="M22 12h-2" />
      <path d="M4 12H2" />
    </svg>
  );
}
