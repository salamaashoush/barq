import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tornado(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 4H3" />
      <path d="M18 8H6" />
      <path d="M19 12H9" />
      <path d="M16 16h-6" />
      <path d="M11 20H9" />
    </svg>
  );
}
