import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Navigation2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <polygon points="12 2 19 21 12 17 5 21 12 2" />
    </svg>
  );
}
