import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SkipBack(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" />
      <path d="M3 20V4" />
    </svg>
  );
}
