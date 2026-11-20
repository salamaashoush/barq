import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronLeft(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
