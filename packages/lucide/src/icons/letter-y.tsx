import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterY(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12v8" />
      <path d="m6 4 6 8 6-8" />
    </svg>
  );
}
