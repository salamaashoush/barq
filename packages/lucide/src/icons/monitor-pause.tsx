import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MonitorPause(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 13V7" />
      <path d="M14 13V7" />
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}
