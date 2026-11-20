import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StretchVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="6" height="20" x="4" y="2" rx="2" />
      <rect width="6" height="20" x="14" y="2" rx="2" />
    </svg>
  );
}
