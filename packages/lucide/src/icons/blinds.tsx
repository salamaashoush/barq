import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Blinds(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3h18" />
      <path d="M20 7H8" />
      <path d="M20 11H8" />
      <path d="M10 19h10" />
      <path d="M8 15h12" />
      <path d="M4 3v14" />
      <circle cx="4" cy="19" r="2" />
    </svg>
  );
}
