import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareSlash(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <line x1="9" x2="15" y1="15" y2="9" />
    </svg>
  );
}
