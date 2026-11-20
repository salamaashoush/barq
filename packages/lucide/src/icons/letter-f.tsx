import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterF(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 12h8" />
      <path d="M6 20V5a1 1 0 011-1h11" />
    </svg>
  );
}
