import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Move3d(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 3v16h16" />
      <path d="m5 19 6-6" />
      <path d="m2 6 3-3 3 3" />
      <path d="m18 16 3 3-3 3" />
    </svg>
  );
}
