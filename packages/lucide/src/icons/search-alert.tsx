import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SearchAlert(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 7v4" />
      <path d="M11 15h.01" />
    </svg>
  );
}
