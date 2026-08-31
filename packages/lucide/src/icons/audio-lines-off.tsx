import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AudioLinesOff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 10v11" />
      <path d="M10 3v1.35" />
      <path d="M14 14v1" />
      <path d="M14 8v.35" />
      <path d="M18 5v7.35" />
      <path d="M2 10v3" />
      <path d="m2 2 20 20" />
      <path d="M22 10v3" />
      <path d="M6 6v11" />
    </svg>
  );
}
