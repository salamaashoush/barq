import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalDistributeStart(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="14" x="4" y="5" rx="2" />
      <rect width="6" height="10" x="14" y="7" rx="2" />
      <path d="M4 2v20" />
      <path d="M14 2v20" />
    </svg>
  );
}
