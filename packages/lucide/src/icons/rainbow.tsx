import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Rainbow(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 17a10 10 0 0 0-20 0" />
      <path d="M6 17a6 6 0 0 1 12 0" />
      <path d="M10 17a2 2 0 0 1 4 0" />
    </svg>
  );
}
