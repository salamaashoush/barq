import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareKanbanPlus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 7v4" />
      <path d="M12.354 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v7.354" />
      <path d="M15 18h6" />
      <path d="M16 7v4.536" />
      <path d="M18 21v-6" />
      <path d="M8 7v7" />
    </svg>
  );
}
