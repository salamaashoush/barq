import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleEllipsis(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <path d="M12 12h.01" />
      <path d="M17 12h.01" />
      <path d="M7 12h.01" />
    </svg>
  );
}
