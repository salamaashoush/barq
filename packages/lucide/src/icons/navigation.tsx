import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Navigation(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}
