import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function IterationCcw(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m16 14 4 4-4 4" />
      <path d="M20 10a8 8 0 1 0-8 8h8" />
    </svg>
  );
}
