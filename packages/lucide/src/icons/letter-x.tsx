import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18 4 6 20" />
      <path d="m6 4 12 16" />
    </svg>
  );
}
