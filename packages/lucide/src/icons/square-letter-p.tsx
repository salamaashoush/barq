import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterP(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 12h4a2 2 0 0 0 0-4H9.5a.5.5 0 0 0-.5.5V16" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
