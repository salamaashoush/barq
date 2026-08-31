import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FlagTriangleRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5" />
    </svg>
  );
}
