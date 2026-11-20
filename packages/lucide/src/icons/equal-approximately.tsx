import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function EqualApproximately(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0" />
      <path d="M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0" />
    </svg>
  );
}
