import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ClockArrowLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 6v6l1.5.8" />
      <path d="M12.338 21.994a10 10 0 1 1 9.587-8.767" />
      <path d="M14 18h8" />
      <path d="m18 22-4-4 4-4" />
    </svg>
  );
}
