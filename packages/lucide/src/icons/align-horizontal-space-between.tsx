import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalSpaceBetween(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="14" x="3" y="5" rx="2" />
      <rect width="6" height="10" x="15" y="7" rx="2" />
      <path d="M3 2v20" />
      <path d="M21 2v20" />
    </svg>
  );
}
