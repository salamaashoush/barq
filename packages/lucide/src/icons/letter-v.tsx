import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterV(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m6 4 5.765 15.835a.25.25 0 00.47 0L18 4" />
    </svg>
  );
}
