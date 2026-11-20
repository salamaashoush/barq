import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterC(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 9.354a4 4 0 1 0 0 5.292" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
