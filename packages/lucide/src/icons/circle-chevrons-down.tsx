import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleChevronsDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 14L12 17L15 14" />
      <path d="M9 8L12 11L15 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
