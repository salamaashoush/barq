import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignVerticalSpaceAround(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="10" height="6" x="7" y="9" rx="2" />
      <path d="M22 20H2" />
      <path d="M22 4H2" />
    </svg>
  );
}
