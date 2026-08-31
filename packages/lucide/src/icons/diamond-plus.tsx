import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DiamondPlus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 8v8" />
      <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z" />
      <path d="M8 12h8" />
    </svg>
  );
}
