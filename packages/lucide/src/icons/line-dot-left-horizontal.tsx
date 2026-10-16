import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotLeftHorizontal(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 12h12" />
      <circle cx="6" cy="12" r="3" />
    </svg>
  );
}
