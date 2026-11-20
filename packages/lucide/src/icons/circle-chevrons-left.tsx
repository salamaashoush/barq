import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleChevronsLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 9L7 12L10 15" />
      <path d="M16 9L13 12L16 15" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
