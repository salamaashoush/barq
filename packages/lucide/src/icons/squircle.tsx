import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Squircle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9" />
    </svg>
  );
}
