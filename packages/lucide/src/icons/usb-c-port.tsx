import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UsbCPort(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 12h12" />
      <rect x="2" y="8" width="20" height="8" rx="4" />
    </svg>
  );
}
