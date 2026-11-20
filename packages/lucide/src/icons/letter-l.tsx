import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterL(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 4v15a1 1 0 001 1h11" />
    </svg>
  );
}
