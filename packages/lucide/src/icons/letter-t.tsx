import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterT(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 20V4" />
      <path d="M5 4h14" />
    </svg>
  );
}
