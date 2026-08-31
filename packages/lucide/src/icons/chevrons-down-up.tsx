import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsDownUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </svg>
  );
}
