import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowUpLeftEnter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15.33 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10.33" />
      <path d="M17 11h-6v6" />
      <path d="m20 20-9-9" />
    </svg>
  );
}
