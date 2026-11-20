import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="12" height="20" x="6" y="2" rx="2" />
    </svg>
  );
}
