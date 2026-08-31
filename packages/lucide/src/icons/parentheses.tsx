import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Parentheses(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 21s-4-3-4-9 4-9 4-9" />
      <path d="M16 3s4 3 4 9-4 9-4 9" />
    </svg>
  );
}
