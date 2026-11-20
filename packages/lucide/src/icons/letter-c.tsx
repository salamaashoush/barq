import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterC(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 6.708a8 8 0 100 10.584" />
    </svg>
  );
}
