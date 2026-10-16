import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotTopVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 9v12" />
      <circle cx="12" cy="6" r="3" />
    </svg>
  );
}
