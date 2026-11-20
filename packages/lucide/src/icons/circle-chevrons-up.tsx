import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleChevronsUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 10L12 7L9 10" />
      <path d="M15 16L12 13L9 16" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
