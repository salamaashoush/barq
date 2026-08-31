import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RadioReceiver(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 16v2" />
      <path d="M19 16v2" />
      <rect width="20" height="8" x="2" y="8" rx="2" />
      <path d="M18 12h.01" />
    </svg>
  );
}
