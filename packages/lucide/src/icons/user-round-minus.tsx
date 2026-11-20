import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundMinus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 21a8 8 0 0 1 13.292-6" />
      <circle cx="10" cy="8" r="5" />
      <path d="M22 19h-6" />
    </svg>
  );
}
