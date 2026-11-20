import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LayoutFreeform(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="4" rx="1" />
      <rect width="7" height="7" x="4" y="14" rx="1" />
    </svg>
  );
}
