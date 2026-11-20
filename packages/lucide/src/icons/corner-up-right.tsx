import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerUpRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m15 14 5-5-5-5" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}
