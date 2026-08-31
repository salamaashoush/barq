import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleEuro(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 9.4a4 4 0 1 0 0 5.2" />
      <path d="M7 12h5" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
