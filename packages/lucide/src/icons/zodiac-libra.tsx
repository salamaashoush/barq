import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacLibra(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 16h6.857c.162-.012.19-.323.038-.38a6 6 0 1 1 4.212 0c-.153.057-.125.368.038.38H21" />
      <path d="M3 20h18" />
    </svg>
  );
}
