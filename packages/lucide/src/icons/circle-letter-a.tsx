import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterA(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 14H9" />
      <circle cx="12" cy="12" r="10" />
      <path d="m8 16 3.453-7.648a.6.6 0 0 1 1.094 0L16 16" />
    </svg>
  );
}
