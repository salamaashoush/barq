import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveUpLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 11V5H11" />
      <path d="M5 5L19 19" />
    </svg>
  );
}
