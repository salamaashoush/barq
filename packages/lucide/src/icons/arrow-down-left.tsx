import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17 7 7 17" />
      <path d="M17 17H7V7" />
    </svg>
  );
}
