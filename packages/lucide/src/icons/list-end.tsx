import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListEnd(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M9 19H3" />
      <path d="m16 16-3 3 3 3" />
      <path d="M21 5v12a2 2 0 0 1-2 2h-6" />
    </svg>
  );
}
