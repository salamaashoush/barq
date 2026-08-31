import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FlaskRound(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 2v6.292a7 7 0 1 0 4 0V2" />
      <path d="M5 15h14" />
      <path d="M8.5 2h7" />
    </svg>
  );
}
