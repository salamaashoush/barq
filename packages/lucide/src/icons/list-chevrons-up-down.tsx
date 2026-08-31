import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListChevronsUpDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 5h8" />
      <path d="M3 12h8" />
      <path d="M3 19h8" />
      <path d="m15 8 3-3 3 3" />
      <path d="m15 16 3 3 3-3" />
    </svg>
  );
}
