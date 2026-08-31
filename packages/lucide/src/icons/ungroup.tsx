import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ungroup(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="11" y="14" width="10" height="7" rx="2" />
      <rect x="3" y="3" width="10" height="7" rx="2" />
    </svg>
  );
}
