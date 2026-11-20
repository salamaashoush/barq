import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m16 9-5.5 5.5L8 12" />
    </svg>
  );
}
