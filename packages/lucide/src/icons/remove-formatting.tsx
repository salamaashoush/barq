import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RemoveFormatting(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7V4h16v3" />
      <path d="M5 20h6" />
      <path d="M13 4 8 20" />
      <path d="m15 15 5 5" />
      <path d="m20 15-5 5" />
    </svg>
  );
}
