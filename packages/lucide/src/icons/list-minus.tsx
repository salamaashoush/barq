import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListMinus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="M21 12h-6" />
    </svg>
  );
}
