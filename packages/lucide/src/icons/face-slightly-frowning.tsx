import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FaceSlightlyFrowning(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 10V9" />
      <path d="M9 10V9" />
      <path d="M9 16a5 5 0 016 0" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
