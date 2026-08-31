import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownNarrowWide(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="M11 4h4" />
      <path d="M11 8h7" />
      <path d="M11 12h10" />
    </svg>
  );
}
