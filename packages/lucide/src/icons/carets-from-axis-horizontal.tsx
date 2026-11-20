import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CaretsFromAxisHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16.703 6.288A1 1 0 0 1 16 8H8a1 1 0 0 1-.703-1.712l3.991-3.99a1 1 0 0 1 1.425-.001z" />
      <path d="M22 12H2" />
      <path d="M7.298 17.712A1 1 0 0 1 8 16h8a1 1 0 0 1 .703 1.712l-3.991 3.99a1 1 0 0 1-1.424.001z" />
    </svg>
  );
}
