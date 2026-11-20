import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronUp(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
