import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TabletSmartphone(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="10" height="14" x="3" y="8" rx="2" />
      <path d="M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4" />
      <path d="M8 18h.01" />
    </svg>
  );
}
