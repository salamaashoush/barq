import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDiagonal2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 13v6h-6" />
      <path d="M5 11V5h6" />
      <path d="m5 5 14 14" />
    </svg>
  );
}
