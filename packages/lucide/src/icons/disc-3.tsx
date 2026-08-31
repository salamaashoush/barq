import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Disc3(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M6 12c0-1.7.7-3.2 1.8-4.2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M18 12c0 1.7-.7 3.2-1.8 4.2" />
    </svg>
  );
}
