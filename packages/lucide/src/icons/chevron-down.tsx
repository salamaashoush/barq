import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
