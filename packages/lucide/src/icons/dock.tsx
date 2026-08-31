import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Dock(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M2 8h20" />
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M6 16h12" />
    </svg>
  );
}
