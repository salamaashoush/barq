import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 15 9 9" />
      <path d="M9 15h6V9" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
