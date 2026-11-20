import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
