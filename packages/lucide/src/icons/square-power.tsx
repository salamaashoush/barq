import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePower(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 7v4" />
      <path d="M7.998 9.003a5 5 0 1 0 8-.005" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
