import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 6L12 2L16 6" />
      <path d="M12 2V22" />
    </svg>
  );
}
