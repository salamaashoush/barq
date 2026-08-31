import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function XLineTop(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M18 4H6" />
      <path d="M18 8 6 20" />
      <path d="m6 8 12 12" />
    </svg>
  );
}
