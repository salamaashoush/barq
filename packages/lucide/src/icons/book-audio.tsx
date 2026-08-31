import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BookAudio(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 6v7" />
      <path d="M16 8v3" />
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M8 8v3" />
    </svg>
  );
}
