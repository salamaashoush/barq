import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BookCopy(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 7a2 2 0 0 0-2 2v11" />
      <path d="M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21" />
      <path d="M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10" />
    </svg>
  );
}
