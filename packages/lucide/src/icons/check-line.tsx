import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CheckLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 4L9 15" />
      <path d="M21 19L3 19" />
      <path d="M9 15L4 10" />
    </svg>
  );
}
