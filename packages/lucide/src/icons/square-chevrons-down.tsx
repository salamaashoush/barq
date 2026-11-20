import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareChevronsDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 14L12 17L15 14" />
      <path d="M9 8L12 11L15 8" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
