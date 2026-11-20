import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Circle(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
