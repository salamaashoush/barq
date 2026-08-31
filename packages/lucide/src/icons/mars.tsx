import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mars(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 3h5v5" />
      <path d="m21 3-6.75 6.75" />
      <circle cx="10" cy="14" r="6" />
    </svg>
  );
}
