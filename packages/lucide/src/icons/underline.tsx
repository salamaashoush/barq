import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Underline(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <line x1="4" x2="20" y1="20" y2="20" />
    </svg>
  );
}
