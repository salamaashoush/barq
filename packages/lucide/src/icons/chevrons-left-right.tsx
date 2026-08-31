import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsLeftRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 7-5 5 5 5" />
      <path d="m15 7 5 5-5 5" />
    </svg>
  );
}
