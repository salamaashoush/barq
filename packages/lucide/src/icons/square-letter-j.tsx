import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterJ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 8v5.5a1 1 0 01-5 0V13" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
