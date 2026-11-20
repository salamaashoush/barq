import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </svg>
  );
}
