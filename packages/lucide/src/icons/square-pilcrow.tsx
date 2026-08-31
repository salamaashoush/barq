import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePilcrow(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 12H9.5a2.5 2.5 0 0 1 0-5H17" />
      <path d="M12 7v10" />
      <path d="M16 7v10" />
    </svg>
  );
}
