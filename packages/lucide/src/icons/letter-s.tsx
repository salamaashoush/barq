import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterS(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 4h-7a4 4 0 000 8h4a4 4 0 010 8H6" />
    </svg>
  );
}
