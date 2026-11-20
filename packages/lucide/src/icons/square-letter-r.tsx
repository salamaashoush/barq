import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterR(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m11 12 4 4" />
      <path d="M9 12h4a2 2 0 0 0 0-4H9.5a.5.5 0 0 0-.5.5V16" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
