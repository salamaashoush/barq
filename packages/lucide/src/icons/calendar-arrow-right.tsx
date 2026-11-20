import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CalendarArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 2v3" />
      <path d="m18 21 3-3h-6" />
      <path d="M21 12.34V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.35" />
      <path d="m21 18-3-3" />
      <path d="M3 9h18" />
      <path d="M8 2v3" />
    </svg>
  );
}
