import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PhilippinePeso(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12h16" />
      <path d="M4 8h16" />
      <path d="M6 20V5a1 1 0 011-1h5a6 6 0 010 12H6" />
    </svg>
  );
}
