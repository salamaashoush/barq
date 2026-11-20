import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ellipsis(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}
