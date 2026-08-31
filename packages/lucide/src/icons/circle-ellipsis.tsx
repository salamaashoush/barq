import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleEllipsis(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M17 12h.01" />
      <path d="M12 12h.01" />
      <path d="M7 12h.01" />
    </svg>
  );
}
