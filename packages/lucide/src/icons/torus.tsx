import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Torus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <ellipse cx="12" cy="11" rx="3" ry="2" />
      <ellipse cx="12" cy="12.5" rx="10" ry="8.5" />
    </svg>
  );
}
