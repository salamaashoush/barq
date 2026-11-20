import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterF(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8.5a.5.5 0 0 1 .5-.5H15" />
      <path d="M9 12h4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
