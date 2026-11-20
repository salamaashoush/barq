import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveUpRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13 5H19V11" />
      <path d="M19 5L5 19" />
    </svg>
  );
}
