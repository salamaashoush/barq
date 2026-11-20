import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronLast(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m7 18 6-6-6-6" />
      <path d="M17 6v12" />
    </svg>
  );
}
