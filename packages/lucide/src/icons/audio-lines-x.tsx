import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AudioLinesX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 3v18" />
      <path d="M14 8v6.35" />
      <path d="m17 17 5 5" />
      <path d="M18 5v8.1" />
      <path d="M2 10v3" />
      <path d="M22 10v3" />
      <path d="m22 17-5 5" />
      <path d="M6 6v11" />
    </svg>
  );
}
