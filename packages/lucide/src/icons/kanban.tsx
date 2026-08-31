import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Kanban(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 3v14" />
      <path d="M12 3v8" />
      <path d="M19 3v18" />
    </svg>
  );
}
