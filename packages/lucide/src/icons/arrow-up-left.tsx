import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M7 17V7h10" />
      <path d="M17 17 7 7" />
    </svg>
  );
}
