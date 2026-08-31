import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Baseline(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 20h16" />
      <path d="m6 16 6-12 6 12" />
      <path d="M8 12h8" />
    </svg>
  );
}
