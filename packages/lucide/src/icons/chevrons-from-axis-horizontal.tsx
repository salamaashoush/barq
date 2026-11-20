import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsFromAxisHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M22 12H2" />
      <path d="m8 17 4 4 4-4" />
      <path d="m8 7 4-4 4 4" />
    </svg>
  );
}
