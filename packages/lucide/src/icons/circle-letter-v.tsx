import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterV(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 8 2.525 7.66a.5.5 0 0 0 .95 0L15 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
