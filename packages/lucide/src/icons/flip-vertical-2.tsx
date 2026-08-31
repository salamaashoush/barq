import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FlipVertical2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m17 3-5 5-5-5h10" />
      <path d="m17 21-5-5-5 5h10" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
    </svg>
  );
}
