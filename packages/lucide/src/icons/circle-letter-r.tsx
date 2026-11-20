import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterR(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m11 12 4 4" />
      <path d="M9 12h4a2 2 0 0 0 0-4H9.5a.5.5 0 0 0-.5.5V16" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
