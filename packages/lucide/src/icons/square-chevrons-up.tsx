import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareChevronsUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 10L12 7L9 10" />
      <path d="M15 16L12 13L9 16" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
