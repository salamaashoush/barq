import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterK(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 16V8" />
      <path d="m11 12 4 4" />
      <path d="m15 8-6 6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
