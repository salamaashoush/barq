import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsRightLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m20 17-5-5 5-5" />
      <path d="m4 17 5-5-5-5" />
    </svg>
  );
}
