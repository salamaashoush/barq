import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerLeftUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 9 9 4 4 9" />
      <path d="M20 20h-7a4 4 0 0 1-4-4V4" />
    </svg>
  );
}
