import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FlipHorizontal2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m3 7 5 5-5 5V7" />
      <path d="m21 7-5 5 5 5V7" />
      <path d="M12 20v2" />
      <path d="M12 14v2" />
      <path d="M12 8v2" />
      <path d="M12 2v2" />
    </svg>
  );
}
