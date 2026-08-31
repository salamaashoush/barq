import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function JapaneseYen(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 9.5V21m0-11.5L6 3m6 6.5L18 3" />
      <path d="M6 15h12" />
      <path d="M6 11h12" />
    </svg>
  );
}
