import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterU(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 8v5a3 3 0 1 1-6 0V8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
