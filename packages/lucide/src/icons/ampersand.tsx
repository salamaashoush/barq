import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ampersand(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 12h3" />
      <path d="M17.5 12a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13" />
    </svg>
  );
}
