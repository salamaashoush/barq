import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LoaderPinwheel(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 3.34A5 5 0 1112 12a5 5 0 10-5 8.66" />
      <path d="M22 12a5 5 0 01-10 0 5 5 0 00-10 0" />
      <path d="M7 3.34A5 5 0 1112 12a5 5 0 105 8.66" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
