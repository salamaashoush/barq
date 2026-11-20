import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListCollapse(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 5h11" />
      <path d="M10 12h11" />
      <path d="M10 19h11" />
      <path d="m3 10 3-3-3-3" />
      <path d="m3 20 3-3-3-3" />
    </svg>
  );
}
