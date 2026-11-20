import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListMusic(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M11 19H3" />
      <path d="M21 16V5" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
