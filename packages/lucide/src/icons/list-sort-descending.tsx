import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListSortDescending(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 12H3" />
      <path d="M3 5h18" />
      <path d="M9 19H3" />
    </svg>
  );
}
