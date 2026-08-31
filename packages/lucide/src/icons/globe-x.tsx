import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GlobeX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m16 3 5 5" />
      <path d="M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10" />
      <path d="m21 3-5 5" />
    </svg>
  );
}
