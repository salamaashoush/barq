import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BluetoothOff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m17 17-5 5V12l-5 5" />
      <path d="m2 2 20 20" />
      <path d="M14.5 9.5 17 7l-5-5v4.5" />
    </svg>
  );
}
