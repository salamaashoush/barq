import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}
