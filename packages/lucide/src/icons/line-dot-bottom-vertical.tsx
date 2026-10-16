import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotBottomVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v12" />
      <circle cx="12" cy="18" r="3" />
    </svg>
  );
}
