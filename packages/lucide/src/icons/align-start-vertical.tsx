import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignStartVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="9" height="6" x="6" y="14" rx="2" />
      <rect width="16" height="6" x="6" y="4" rx="2" />
      <path d="M2 2v20" />
    </svg>
  );
}
