import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListMinus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="M21 12h-6" />
    </svg>
  );
}
