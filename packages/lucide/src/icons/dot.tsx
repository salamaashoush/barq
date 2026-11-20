import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Dot(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}
