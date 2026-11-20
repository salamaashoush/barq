import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterI(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V8" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
