import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterU(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 8v5a3 3 0 1 1-6 0V8" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
