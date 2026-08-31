import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerRightDown(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m10 15 5 5 5-5" />
      <path d="M4 4h7a4 4 0 0 1 4 4v12" />
    </svg>
  );
}
