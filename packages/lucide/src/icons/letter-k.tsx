import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterK(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17 4 6 15" />
      <path d="M6 20V4" />
      <path d="m9 12 8 8" />
    </svg>
  );
}
