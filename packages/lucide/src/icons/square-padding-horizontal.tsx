import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePaddingHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M17 16V8" />
      <path d="M7 16V8" />
    </svg>
  );
}
