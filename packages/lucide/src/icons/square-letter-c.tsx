import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterC(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 9.354a4 4 0 1 0 0 5.292" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
