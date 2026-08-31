import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignVerticalDistributeStart(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="14" height="6" x="5" y="14" rx="2" />
      <rect width="10" height="6" x="7" y="4" rx="2" />
      <path d="M2 14h20" />
      <path d="M2 4h20" />
    </svg>
  );
}
