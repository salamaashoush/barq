import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserMinus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </svg>
  );
}
