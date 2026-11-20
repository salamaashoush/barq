import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListSortAscending(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 19h18" />
      <path d="M15 12H3" />
      <path d="M9 5H3" />
    </svg>
  );
}
