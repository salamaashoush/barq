import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerDownRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15 10 5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  );
}
