import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListCheck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M11 19H3" />
      <path d="m15 18 2 2 4-4" />
    </svg>
  );
}
