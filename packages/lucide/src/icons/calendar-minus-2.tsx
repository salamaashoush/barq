import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CalendarMinus2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M10 15h4" />
    </svg>
  );
}
