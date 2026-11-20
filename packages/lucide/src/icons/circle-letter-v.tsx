import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterV(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m9 8 2.525 7.66a.5.5 0 0 0 .95 0L15 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
