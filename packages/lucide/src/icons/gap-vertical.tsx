import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GapVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 12h2" />
      <path d="M8 12h2" />
      <path d="M14 12h2" />
      <path d="M20 12h2" />
      <path d="M3 21v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
      <path d="M3 3v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3" />
    </svg>
  );
}
