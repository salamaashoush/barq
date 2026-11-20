import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownExit(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 11v10" />
      <path d="M17.67 21H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h1.33" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}
