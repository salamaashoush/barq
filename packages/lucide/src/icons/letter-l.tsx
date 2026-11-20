import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterL(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 4v15a1 1 0 001 1h11" />
    </svg>
  );
}
