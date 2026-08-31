import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m7 6 5 5 5-5" />
      <path d="m7 13 5 5 5-5" />
    </svg>
  );
}
