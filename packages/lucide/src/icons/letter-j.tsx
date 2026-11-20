import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterJ(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17 4v11a5 5 0 01-10 0" />
    </svg>
  );
}
