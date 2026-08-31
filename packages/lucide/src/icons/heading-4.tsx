import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Heading4(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 18V6" />
      <path d="M17 10v3a1 1 0 0 0 1 1h3" />
      <path d="M21 10v8" />
      <path d="M4 12h8" />
      <path d="M4 18V6" />
    </svg>
  );
}
