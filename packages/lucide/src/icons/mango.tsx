import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mango(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m17 6 3-3" />
      <path d="M7 22a4 4 0 01-2.62-7.023A2 2 0 005 13.383V10a8 8 0 1116 0A12 12 0 019 22z" />
    </svg>
  );
}
