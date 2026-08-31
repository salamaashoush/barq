import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FishSymbol(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 16s9-15 20-4C11 23 2 8 2 8" />
    </svg>
  );
}
