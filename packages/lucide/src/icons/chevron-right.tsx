import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
