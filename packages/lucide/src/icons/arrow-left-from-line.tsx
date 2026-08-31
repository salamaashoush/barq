import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowLeftFromLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 6-6 6 6 6" />
      <path d="M3 12h14" />
      <path d="M21 19V5" />
    </svg>
  );
}
