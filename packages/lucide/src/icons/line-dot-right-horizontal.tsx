import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotRightHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M 3 12 L 15 12" />
      <circle cx="18" cy="12" r="3" />
    </svg>
  );
}
