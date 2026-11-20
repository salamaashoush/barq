import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChartNoAxesColumnDecreasing(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 21V3" />
      <path d="M12 21V9" />
      <path d="M19 21v-6" />
    </svg>
  );
}
