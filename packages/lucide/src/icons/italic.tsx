import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Italic(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <line x1="19" x2="10" y1="4" y2="4" />
      <line x1="14" x2="5" y1="20" y2="20" />
      <line x1="15" x2="9" y1="4" y2="20" />
    </svg>
  );
}
