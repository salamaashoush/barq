import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Whistle(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 6v4" />
      <path d="M21 6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.675A7 7 0 1 1 9 6z" />
    </svg>
  );
}
