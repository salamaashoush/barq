import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="12" height="20" x="6" y="2" rx="2" />
    </svg>
  );
}
