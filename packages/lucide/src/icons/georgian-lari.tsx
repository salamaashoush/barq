import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GeorgianLari(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 10V3" />
      <path d="M14 10V3" />
      <path d="M19 13a7 7 0 10-7 7" />
      <path d="M5 20h14" />
    </svg>
  );
}
