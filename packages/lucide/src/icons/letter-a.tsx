import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterA(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17.117 14H6.883" />
      <path d="m4 20 7.55-15.712a.5.5 0 01.9 0L20 20" />
    </svg>
  );
}
