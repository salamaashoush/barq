import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterL(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 8v7.5a.5.5 0 0 0 .5.5H15" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
