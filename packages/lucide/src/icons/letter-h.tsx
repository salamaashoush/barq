import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterH(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 20V4" />
      <path d="M6 12H18" />
      <path d="M6 20V4" />
    </svg>
  );
}
