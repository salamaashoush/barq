import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextQuote(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 5H3" />
      <path d="M21 12H8" />
      <path d="M21 19H8" />
      <path d="M3 12v7" />
    </svg>
  );
}
