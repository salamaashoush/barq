import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mountain(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}
