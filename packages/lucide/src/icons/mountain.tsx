import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mountain(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}
