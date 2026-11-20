import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterX(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 4 6 20" />
      <path d="m6 4 12 16" />
    </svg>
  );
}
