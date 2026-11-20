import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterX(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m9 16 6-8" />
      <path d="m9 8 6 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
