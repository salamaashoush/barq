import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterE(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18 4H7a1 1 0 00-1 1v14a1 1 0 001 1h11" />
      <path d="M6 12h8" />
    </svg>
  );
}
