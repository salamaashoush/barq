import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotRightHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M 3 12 L 15 12" />
      <circle cx="18" cy="12" r="3" />
    </svg>
  );
}
