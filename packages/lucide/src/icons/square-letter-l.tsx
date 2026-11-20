import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterL(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 8v7.5a.5.5 0 0 0 .5.5H15" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
