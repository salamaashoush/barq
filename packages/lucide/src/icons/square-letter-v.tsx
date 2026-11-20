import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterV(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m9 8 2.525 7.66a.5.5 0 0 0 .95 0L15 8" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
