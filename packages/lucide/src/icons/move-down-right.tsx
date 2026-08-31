import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDownRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M19 13V19H13" />
      <path d="M5 5L19 19" />
    </svg>
  );
}
