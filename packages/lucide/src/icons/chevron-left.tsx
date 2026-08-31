import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronLeft(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
