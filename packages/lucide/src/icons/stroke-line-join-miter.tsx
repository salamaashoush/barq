import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeLineJoinMiter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 21v-2.002" />
      <path d="M3 3h16a2 2 0 012 2v16" />
      <path d="M5 13H3" />
      <path d="M9 13h1a1 1 0 011 1v1" />
    </svg>
  );
}
