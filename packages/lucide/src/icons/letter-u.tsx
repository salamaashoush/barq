import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterU(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 4v10a6 6 0 0012 0V4" />
    </svg>
  );
}
