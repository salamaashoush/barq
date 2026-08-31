import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SmartphoneCharging(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12.667 8 10 12h4l-2.667 4" />
    </svg>
  );
}
