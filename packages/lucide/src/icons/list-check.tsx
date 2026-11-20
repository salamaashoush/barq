import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M11 19H3" />
      <path d="m15 18 2 2 4-4" />
    </svg>
  );
}
