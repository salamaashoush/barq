import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterJ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 4v11a5 5 0 01-10 0" />
    </svg>
  );
}
