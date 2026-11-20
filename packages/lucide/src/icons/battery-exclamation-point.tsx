import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BatteryExclamationPoint(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 16h.01" />
      <path d="M10 8v4" />
      <path d="M14 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
      <path d="M22 14v-4" />
      <path d="M6 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
