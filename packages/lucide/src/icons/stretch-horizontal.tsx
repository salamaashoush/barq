import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StretchHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="6" x="2" y="4" rx="2" />
      <rect width="20" height="6" x="2" y="14" rx="2" />
    </svg>
  );
}
