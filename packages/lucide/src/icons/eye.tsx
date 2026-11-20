import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Eye(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
