import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareChevronsLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 9L7 12L10 15" />
      <path d="M16 9L13 12L16 15" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
