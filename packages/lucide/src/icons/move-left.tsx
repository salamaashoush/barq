import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 8L2 12L6 16" />
      <path d="M2 12H22" />
    </svg>
  );
}
