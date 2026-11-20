import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterT(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V8" />
      <path d="M9 8h6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
