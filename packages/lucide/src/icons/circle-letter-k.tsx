import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterK(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8" />
      <path d="m11 12 4 4" />
      <path d="m15 8-6 6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
