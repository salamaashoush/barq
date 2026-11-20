import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Equal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <line x1="5" x2="19" y1="9" y2="9" />
      <line x1="5" x2="19" y1="15" y2="15" />
    </svg>
  );
}
