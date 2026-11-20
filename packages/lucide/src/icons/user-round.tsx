import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRound(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}
