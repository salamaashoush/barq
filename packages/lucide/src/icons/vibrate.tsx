import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Vibrate(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m2 8 2 2-2 2 2 2-2 2" />
      <path d="m22 8-2 2 2 2-2 2 2 2" />
      <rect width="8" height="14" x="8" y="5" rx="1" />
    </svg>
  );
}
