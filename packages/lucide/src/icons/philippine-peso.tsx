import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PhilippinePeso(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 11H4" />
      <path d="M20 7H4" />
      <path d="M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7" />
    </svg>
  );
}
