import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MirrorRound(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 6.6 8.6 8" />
      <path d="M12 18v4" />
      <path d="M15 7.5 9.5 13" />
      <path d="M7 22h10" />
      <circle cx="12" cy="10" r="8" />
    </svg>
  );
}
