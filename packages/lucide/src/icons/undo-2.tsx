import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Undo2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}
