import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownLeftEnter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 7v6h6" />
      <path d="m20 4-9 9" />
      <path d="M21 8.67V19a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h10.33" />
    </svg>
  );
}
