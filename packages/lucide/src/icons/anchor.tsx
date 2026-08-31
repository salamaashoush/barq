import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Anchor(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 6v16" />
      <path d="m19 13 2-1a9 9 0 0 1-18 0l2 1" />
      <path d="M9 11h6" />
      <circle cx="12" cy="4" r="2" />
    </svg>
  );
}
