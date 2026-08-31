import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListSortAscending(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 19h18" />
      <path d="M15 12H3" />
      <path d="M9 5H3" />
    </svg>
  );
}
