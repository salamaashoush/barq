import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Option(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14 3h7" />
      <path d="M3 3h5.28a1 1 0 0 1 .948.684l5.544 16.632a1 1 0 0 0 .949.684H21" />
    </svg>
  );
}
