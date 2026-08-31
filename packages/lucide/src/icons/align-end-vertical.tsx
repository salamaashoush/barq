import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignEndVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="16" height="6" x="2" y="4" rx="2" />
      <rect width="9" height="6" x="9" y="14" rx="2" />
      <path d="M22 22V2" />
    </svg>
  );
}
