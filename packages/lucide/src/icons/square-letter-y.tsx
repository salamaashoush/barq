import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterY(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 8 3 4 3-4" />
      <path d="M12 12v4" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
