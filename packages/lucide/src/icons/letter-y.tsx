import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterY(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 12v8" />
      <path d="m6 4 6 8 6-8" />
    </svg>
  );
}
