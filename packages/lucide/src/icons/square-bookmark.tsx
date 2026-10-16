import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareBookmark(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 3v7.751a.25.25 0 00.407.195l2.28-1.834a.5.5 0 01.627 0l2.28 1.834a.25.25 0 00.406-.195V3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
