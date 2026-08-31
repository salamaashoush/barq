import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FileExclamationPoint(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
