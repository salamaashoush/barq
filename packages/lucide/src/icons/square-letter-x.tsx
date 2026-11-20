import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 16 6-8" />
      <path d="m9 8 6 8" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
