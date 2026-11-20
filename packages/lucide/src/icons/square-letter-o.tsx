import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterO(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="4" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
