import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronUp(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
