import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterR(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m10 12 8 8" />
      <path d="M6 12h8a4 4 0 000-8H7a1 1 0 00-1 1v15" />
    </svg>
  );
}
