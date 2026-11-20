import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Minus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 12h14" />
    </svg>
  );
}
