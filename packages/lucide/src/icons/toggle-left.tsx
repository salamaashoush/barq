import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ToggleLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="9" cy="12" r="3" />
      <rect width="20" height="14" x="2" y="5" rx="7" />
    </svg>
  );
}
