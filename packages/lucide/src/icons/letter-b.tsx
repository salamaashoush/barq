import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterB(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8" />
    </svg>
  );
}
