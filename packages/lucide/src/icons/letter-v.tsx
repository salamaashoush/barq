import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterV(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m6 4 5.765 15.835a.25.25 0 00.47 0L18 4" />
    </svg>
  );
}
