import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartColumnBig(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <rect x="15" y="5" width="4" height="12" rx="1" />
      <rect x="7" y="8" width="4" height="9" rx="1" />
    </svg>
  );
}
