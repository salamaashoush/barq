import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignCenter(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M21 5H3" />
      <path d="M17 12H7" />
      <path d="M19 19H5" />
    </svg>
  );
}
