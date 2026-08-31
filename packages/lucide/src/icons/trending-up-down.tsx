import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingUpDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14.828 14.828 21 21" />
      <path d="M21 16v5h-5" />
      <path d="m21 3-9 9-4-4-6 6" />
      <path d="M21 8V3h-5" />
    </svg>
  );
}
