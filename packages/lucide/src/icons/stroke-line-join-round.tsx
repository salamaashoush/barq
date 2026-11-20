import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineJoinRound(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 21v-2.002" />
      <path d="M3 3h8a10 10 0 0110 10v8" />
      <path d="M5 13H3" />
      <path d="M9 13h1a1 1 0 011 1v1" />
    </svg>
  );
}
