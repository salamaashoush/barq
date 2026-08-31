import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowRightToLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 12H3" />
      <path d="m11 18 6-6-6-6" />
      <path d="M21 5v14" />
    </svg>
  );
}
