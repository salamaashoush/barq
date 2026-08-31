import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignStart(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 5H3" />
      <path d="M15 12H3" />
      <path d="M17 19H3" />
    </svg>
  );
}
