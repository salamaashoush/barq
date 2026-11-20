import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ellipse(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <ellipse cx="12" cy="12" rx="10" ry="6" />
    </svg>
  );
}
