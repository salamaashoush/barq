import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterT(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 20V4" />
      <path d="M5 4h14" />
    </svg>
  );
}
