import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerRightUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m10 9 5-5 5 5" />
      <path d="M4 20h7a4 4 0 0 0 4-4V4" />
    </svg>
  );
}
