import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UndoDot(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      <path d="M3 7v6h6" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  );
}
