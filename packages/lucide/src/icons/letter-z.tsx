import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterZ(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 4h11.5a.5.5 0 01.387.817L6.114 19.183a.5.5 0 00.387.817H18" />
    </svg>
  );
}
