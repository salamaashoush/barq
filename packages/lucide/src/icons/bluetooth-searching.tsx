import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BluetoothSearching(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m7 7 10 10-5 5V2l5 5L7 17" />
      <path d="M20.83 14.83a4 4 0 0 0 0-5.66" />
      <path d="M18 12h.01" />
    </svg>
  );
}
