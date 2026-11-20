import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BatteryMedium(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 14v-4" />
      <path d="M22 14v-4" />
      <path d="M6 14v-4" />
      <rect x="2" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
