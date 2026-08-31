import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TurkishLira(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 4 5 9" />
      <path d="m15 8.5-10 5" />
      <path d="M18 12a9 9 0 0 1-9 9V3" />
    </svg>
  );
}
