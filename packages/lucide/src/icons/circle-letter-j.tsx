import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterJ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 8v5.5a1 1 0 01-5 0V13" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
