import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MonitorUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 10 3-3 3 3" />
      <path d="M12 13V7" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}
