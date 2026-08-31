import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CloudAlert(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12v4" />
      <path d="M12 20h.01" />
      <path d="M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642" />
    </svg>
  );
}
