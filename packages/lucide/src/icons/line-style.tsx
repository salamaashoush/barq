import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineStyle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 5h2" />
      <path d="M15 12h6" />
      <path d="M19 5h2" />
      <path d="M3 12h6" />
      <path d="M3 19h18" />
      <path d="M3 5h2" />
    </svg>
  );
}
