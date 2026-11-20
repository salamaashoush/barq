import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleCircle(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14 4v16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <circle cx="14" cy="12" r="8" />
    </svg>
  );
}
