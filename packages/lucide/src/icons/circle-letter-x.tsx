import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 16 6-8" />
      <path d="m9 8 6 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
