import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GlobeCheck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15 6 2 2 4-4" />
      <path d="M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10" />
    </svg>
  );
}
