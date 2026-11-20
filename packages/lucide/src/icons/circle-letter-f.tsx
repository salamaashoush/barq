import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterF(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 16V8.5a.5.5 0 0 1 .5-.5H15" />
      <path d="M9 12h4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
