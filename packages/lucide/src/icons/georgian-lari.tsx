import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GeorgianLari(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 10V3" />
      <path d="M14 10V3" />
      <path d="M19 13a7 7 0 10-7 7" />
      <path d="M5 20h14" />
    </svg>
  );
}
