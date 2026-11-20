import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeWidth(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.25 3h17.5" />
      <rect x="3" y="7" width="18" height="4" rx="1" />
      <rect x="3" y="15" width="18" height="6" rx="1" />
    </svg>
  );
}
