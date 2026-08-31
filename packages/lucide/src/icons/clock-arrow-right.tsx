import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ClockArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 6v6l2 1" />
      <path d="M13.5 21.885A10 10 0 1 1 22 12" />
      <path d="M14 18h8" />
      <path d="m18 22 4-4-4-4" />
    </svg>
  );
}
