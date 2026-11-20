import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PoundSterling(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 18a2 2 0 01-2 2H5a3 3 0 003-3V8a4 4 0 018 0" />
      <path d="M6 12h7" />
    </svg>
  );
}
