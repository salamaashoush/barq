import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleArrowLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m12 8-4 4 4 4" />
      <path d="M16 12H8" />
    </svg>
  );
}
