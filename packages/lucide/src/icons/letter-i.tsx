import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterI(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 20V4" />
    </svg>
  );
}
