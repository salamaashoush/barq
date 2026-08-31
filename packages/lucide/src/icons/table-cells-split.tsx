import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TableCellsSplit(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 15V9" />
      <path d="M3 15h18" />
      <path d="M3 9h18" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
