import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareDashedBottom(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
    </svg>
  );
}
