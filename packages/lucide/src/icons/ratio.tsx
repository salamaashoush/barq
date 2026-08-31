import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ratio(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="12" height="20" x="6" y="2" rx="2" />
      <rect width="20" height="12" x="2" y="6" rx="2" />
    </svg>
  );
}
