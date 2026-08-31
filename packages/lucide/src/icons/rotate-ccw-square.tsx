import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RotateCcwSquare(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 9V7a2 2 0 0 0-2-2h-6" />
      <path d="m15 2-3 3 3 3" />
      <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
