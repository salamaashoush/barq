import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tally2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 4v16" />
      <path d="M9 4v16" />
    </svg>
  );
}
