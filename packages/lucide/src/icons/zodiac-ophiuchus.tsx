import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacOphiuchus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 10A6.06 6.06 0 0 1 12 10 A6.06 6.06 0 0 0 21 10" />
      <path d="M6 3v12a6 6 0 0 0 12 0V3" />
    </svg>
  );
}
