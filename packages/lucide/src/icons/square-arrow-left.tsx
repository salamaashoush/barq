import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m12 8-4 4 4 4" />
      <path d="M16 12H8" />
    </svg>
  );
}
