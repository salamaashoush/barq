import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterM(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 20V4.253a.25.25 0 01.454-.144l6.727 9.467a1 1 0 001.63 0l6.735-9.468a.25.25 0 01.454.145V20" />
    </svg>
  );
}
