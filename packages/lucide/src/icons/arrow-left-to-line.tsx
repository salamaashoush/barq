import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowLeftToLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 19V5" />
      <path d="m13 6-6 6 6 6" />
      <path d="M7 12h14" />
    </svg>
  );
}
