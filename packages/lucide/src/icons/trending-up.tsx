import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TrendingUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}
