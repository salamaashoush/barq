import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineSquiggle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2" />
    </svg>
  );
}
