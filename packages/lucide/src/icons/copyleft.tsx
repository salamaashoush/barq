import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Copyleft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.17 14.83a4 4 0 1 0 0-5.66" />
    </svg>
  );
}
