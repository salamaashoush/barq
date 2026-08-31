import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Lasso(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" />
      <path d="M7 22a5 5 0 0 1-2-3.994" />
      <circle cx="5" cy="16" r="2" />
    </svg>
  );
}
