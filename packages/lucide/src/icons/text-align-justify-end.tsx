import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignJustifyEnd(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 5h18" />
      <path d="M3 12h18" />
      <path d="M11 19h10" />
    </svg>
  );
}
