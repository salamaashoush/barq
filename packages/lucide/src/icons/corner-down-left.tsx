import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerDownLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      <path d="m9 10-5 5 5 5" />
    </svg>
  );
}
