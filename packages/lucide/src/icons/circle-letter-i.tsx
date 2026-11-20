import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterI(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
