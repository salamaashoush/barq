import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterJ(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14 8v5.5a1 1 0 01-5 0V13" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
