import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsUpDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}
