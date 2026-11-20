import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterH(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8" />
      <path d="M15 16V8" />
      <path d="M9 12h6" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
