import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MarginLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M3 3v18" />
    </svg>
  );
}
