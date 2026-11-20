import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterL(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 8v7.5a.5.5 0 0 0 .5.5H15" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
