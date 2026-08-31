import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Microwave(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="15" x="2" y="4" rx="2" />
      <rect width="8" height="7" x="6" y="8" rx="1" />
      <path d="M18 8v7" />
      <path d="M6 19v2" />
      <path d="M18 19v2" />
    </svg>
  );
}
