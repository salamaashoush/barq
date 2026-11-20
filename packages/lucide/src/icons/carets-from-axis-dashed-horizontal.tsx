import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CaretsFromAxisDashedHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="M4 12H2" />
      <path d="M7.298 17.712A1 1 0 0 1 8 16h8a1 1 0 0 1 .703 1.712l-3.991 3.99a1 1 0 0 1-1.424.001z" />
      <path d="M7.298 6.288A1 1 0 0 0 8 8h8a1 1 0 0 0 .703-1.712l-3.991-3.99a1 1 0 0 0-1.424-.001z" />
    </svg>
  );
}
