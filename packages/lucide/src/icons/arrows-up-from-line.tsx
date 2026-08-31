import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsUpFromLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m4 6 3-3 3 3" />
      <path d="M7 17V3" />
      <path d="m14 6 3-3 3 3" />
      <path d="M17 17V3" />
      <path d="M4 21h16" />
    </svg>
  );
}
