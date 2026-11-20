import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDownLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 19H5V13" />
      <path d="M19 5L5 19" />
    </svg>
  );
}
