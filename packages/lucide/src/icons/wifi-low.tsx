import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function WifiLow(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
  );
}
