import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundExclamationPoint(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19.99 13v4" />
      <path d="M19.99 21H20" />
      <path d="M4 21a8 8 0 0111.99-6.934" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}
