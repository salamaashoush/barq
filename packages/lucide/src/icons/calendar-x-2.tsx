import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CalendarX2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 2v3" />
      <path d="m17 16 5 5" />
      <path d="m17 21 5-5" />
      <path d="M21 12V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8" />
      <path d="M3 9h18" />
      <path d="M8 2v3" />
    </svg>
  );
}
