import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareRadical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 12h2l2 5 2-10h4" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
