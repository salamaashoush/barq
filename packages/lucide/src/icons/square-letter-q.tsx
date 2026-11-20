import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterQ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="m16 16-2.5-2.5" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
