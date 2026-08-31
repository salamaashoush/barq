import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Touchpad(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M2 14h20" />
      <path d="M12 20v-6" />
    </svg>
  );
}
