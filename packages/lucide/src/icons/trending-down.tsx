import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 17h6v-6" />
      <path d="m22 17-8.5-8.5-5 5L2 7" />
    </svg>
  );
}
