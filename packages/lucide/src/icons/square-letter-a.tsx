import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterA(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m8 16 3.453-7.648a.6.6 0 0 1 1.094 0L16 16" />
      <path d="M15 14H9" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
