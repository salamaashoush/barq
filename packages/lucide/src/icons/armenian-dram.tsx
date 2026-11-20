import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArmenianDram(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 10h8" />
      <path d="M11 14h8" />
      <path d="M17 20V10a6 6 0 0 0-12 0" />
    </svg>
  );
}
