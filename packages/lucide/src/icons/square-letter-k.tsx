import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterK(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 16V8" />
      <path d="m11 12 4 4" />
      <path d="m15 8-6 6" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
