import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function JapaneseYen(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12v8" />
      <path d="m6 4 6 8 6-8" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </svg>
  );
}
