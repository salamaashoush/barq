import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquarePadding(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M14 17h-4" />
      <path d="M14 7h-4" />
      <path d="M17 14v-4" />
      <path d="M7 14v-4" />
    </svg>
  );
}
