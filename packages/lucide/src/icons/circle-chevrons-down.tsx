import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleChevronsDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 14L12 17L15 14" />
      <path d="M9 8L12 11L15 8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
