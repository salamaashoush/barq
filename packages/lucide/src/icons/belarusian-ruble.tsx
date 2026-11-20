import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BelarusianRuble(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 16 L13 16" />
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7" />
    </svg>
  );
}
