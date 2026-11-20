import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SearchCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m8 11 2 2 4-4" />
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
