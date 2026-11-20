import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterW(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m16 8-1.591 7.598a.497.497 0 01-.97.038l-.96-3.276a.5.5 0 00-.959 0l-.96 3.276a.496.496 0 01-.969-.038L8 8" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
