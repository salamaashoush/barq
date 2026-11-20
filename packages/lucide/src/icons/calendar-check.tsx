import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CalendarCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}
