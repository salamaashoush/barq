import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterD(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 4a8 8 0 010 16H6.406A.406.406 0 016 19.594V4.406A.406.406 0 016.406 4z" />
    </svg>
  );
}
