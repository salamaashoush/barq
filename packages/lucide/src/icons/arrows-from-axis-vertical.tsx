import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsFromAxisVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 22V2" />
      <path d="m19 15 3-3-3-3" />
      <path d="M22 12h-6" />
      <path d="m5 15-3-3 3-3" />
      <path d="M8 12H2" />
    </svg>
  );
}
