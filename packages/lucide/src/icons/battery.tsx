import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Battery(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M 22 14 L 22 10" />
      <rect x="2" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
