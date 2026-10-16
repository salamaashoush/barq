import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Whistle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 6v4" />
      <path d="M21 6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.675A7 7 0 1 1 9 6z" />
    </svg>
  );
}
