import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SwissFranc(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 21V3h8" />
      <path d="M6 16h9" />
      <path d="M10 9.5h7" />
    </svg>
  );
}
