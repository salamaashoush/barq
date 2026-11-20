import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListX(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="m15.5 9.5 5 5" />
      <path d="m20.5 9.5-5 5" />
    </svg>
  );
}
