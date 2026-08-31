import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalSpaceAround(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="10" x="9" y="7" rx="2" />
      <path d="M4 22V2" />
      <path d="M20 22V2" />
    </svg>
  );
}
