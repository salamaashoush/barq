import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterG(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 6.708a8 8 0 10-.526 11.126c.355-.333.526-.811.526-1.299V13a1 1 0 00-1-1h-4" />
    </svg>
  );
}
