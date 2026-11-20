import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsDownUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </svg>
  );
}
