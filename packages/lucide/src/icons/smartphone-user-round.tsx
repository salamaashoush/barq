import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SmartphoneUserRound(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 22H6a2 2 0 01-2-2V4a2 2 0 012-2h10a2 2 0 012 2v4" />
      <path d="M11 18h.01" />
      <path d="M22 22a4 4 0 00-8 0" />
      <circle cx="18" cy="15" r="3" />
    </svg>
  );
}
