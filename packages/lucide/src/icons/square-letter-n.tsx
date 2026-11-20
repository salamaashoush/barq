import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterN(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8.576a.496.496 0 01.937-.243l4.126 7.43A.496.496 0 0015 15.52V8" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
