import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerRightUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m10 9 5-5 5 5" />
      <path d="M4 20h7a4 4 0 0 0 4-4V4" />
    </svg>
  );
}
