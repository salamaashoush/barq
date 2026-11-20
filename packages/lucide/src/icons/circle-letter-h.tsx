import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterH(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8" />
      <path d="M15 16V8" />
      <path d="M9 12h6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
