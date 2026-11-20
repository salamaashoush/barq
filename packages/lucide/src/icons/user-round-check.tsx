import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 21a8 8 0 0 1 13.292-6" />
      <circle cx="10" cy="8" r="5" />
      <path d="m16 19 2 2 4-4" />
    </svg>
  );
}
