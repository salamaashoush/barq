import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2v20" />
      <path d="m8 18 4 4 4-4" />
      <path d="m8 6 4-4 4 4" />
    </svg>
  );
}
