import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignEndHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="16" x="4" y="2" rx="2" />
      <rect width="6" height="9" x="14" y="9" rx="2" />
      <path d="M22 22H2" />
    </svg>
  );
}
