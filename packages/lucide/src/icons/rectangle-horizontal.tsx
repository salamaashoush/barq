import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RectangleHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="20" height="12" x="2" y="6" rx="2" />
    </svg>
  );
}
