import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m17 11-5-5-5 5" />
      <path d="m17 18-5-5-5 5" />
    </svg>
  );
}
