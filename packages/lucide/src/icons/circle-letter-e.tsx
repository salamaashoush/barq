import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterE(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 8H9.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5H15" />
      <path d="M9 12h4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
