import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterB(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8" />
    </svg>
  );
}
