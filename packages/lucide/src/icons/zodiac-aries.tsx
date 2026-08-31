import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacAries(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 7.5a4.5 4.5 0 1 1 5 4.5" />
      <path d="M7 12a4.5 4.5 0 1 1 5-4.5V21" />
    </svg>
  );
}
