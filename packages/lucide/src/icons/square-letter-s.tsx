import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterS(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14.5 8H11a2 2 0 100 4h2a2 2 0 110 4H9" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
