import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartBarBig(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <rect x="7" y="13" width="9" height="4" rx="1" />
      <rect x="7" y="5" width="12" height="4" rx="1" />
    </svg>
  );
}
