import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalJustifyEnd(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="6" height="14" x="2" y="5" rx="2" />
      <rect width="6" height="10" x="12" y="7" rx="2" />
      <path d="M22 2v20" />
    </svg>
  );
}
