import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterS(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14.5 8H11a2 2 0 100 4h2a2 2 0 110 4H9" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
