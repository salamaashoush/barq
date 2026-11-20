import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListSortDescending(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 12H3" />
      <path d="M3 5h18" />
      <path d="M9 19H3" />
    </svg>
  );
}
