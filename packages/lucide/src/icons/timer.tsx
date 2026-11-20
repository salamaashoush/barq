import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Timer(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}
