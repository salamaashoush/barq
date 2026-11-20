import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StretchHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="20" height="6" x="2" y="4" rx="2" />
      <rect width="20" height="6" x="2" y="14" rx="2" />
    </svg>
  );
}
