import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownRightEnter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 7v6H7" />
      <path d="m4 4 9 9" />
      <path d="M8.67 3H19a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V8.67" />
    </svg>
  );
}
