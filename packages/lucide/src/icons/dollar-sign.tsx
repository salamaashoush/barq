import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DollarSign(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v18" />
      <path d="M17 5H9.5a1 1 0 000 7h5a1 1 0 010 7H6" />
    </svg>
  );
}
