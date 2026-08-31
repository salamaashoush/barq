import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsLeftRightEllipsis(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12h.01" />
      <path d="M16 12h.01" />
      <path d="m17 7 5 5-5 5" />
      <path d="m7 7-5 5 5 5" />
      <path d="M8 12h.01" />
    </svg>
  );
}
