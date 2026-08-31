import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ToggleRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="15" cy="12" r="3" />
      <rect width="20" height="14" x="2" y="5" rx="7" />
    </svg>
  );
}
