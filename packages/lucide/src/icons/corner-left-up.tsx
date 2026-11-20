import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerLeftUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14 9 9 4 4 9" />
      <path d="M20 20h-7a4 4 0 0 1-4-4V4" />
    </svg>
  );
}
