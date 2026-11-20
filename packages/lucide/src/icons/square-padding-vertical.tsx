import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePaddingVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 17h8" />
      <path d="M8 7h8" />
    </svg>
  );
}
