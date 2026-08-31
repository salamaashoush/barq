import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 18L12 22L16 18" />
      <path d="M12 2V22" />
    </svg>
  );
}
