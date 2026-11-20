import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowUpEnter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 21V11" />
      <path d="m16 15-4-4-4 4" />
      <path d="M8 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2h-3" />
    </svg>
  );
}
