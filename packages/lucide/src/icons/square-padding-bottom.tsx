import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePaddingBottom(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 17h8" />
    </svg>
  );
}
