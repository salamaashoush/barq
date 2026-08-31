import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Heading(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 12h12" />
      <path d="M6 20V4" />
      <path d="M18 20V4" />
    </svg>
  );
}
