import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterI(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 20V4" />
    </svg>
  );
}
