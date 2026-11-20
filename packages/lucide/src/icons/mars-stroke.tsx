import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MarsStroke(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m14 6 4 4" />
      <path d="M17 3h4v4" />
      <path d="m21 3-7.75 7.75" />
      <circle cx="9" cy="15" r="6" />
    </svg>
  );
}
