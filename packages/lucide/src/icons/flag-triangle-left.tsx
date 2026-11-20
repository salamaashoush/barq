import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FlagTriangleLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 22V2.8a.8.8 0 0 0-1.17-.71L5.45 7.78a.8.8 0 0 0 0 1.44L18 15.5" />
    </svg>
  );
}
