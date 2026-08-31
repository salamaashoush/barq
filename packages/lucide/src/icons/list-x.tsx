import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="m15.5 9.5 5 5" />
      <path d="m20.5 9.5-5 5" />
    </svg>
  );
}
