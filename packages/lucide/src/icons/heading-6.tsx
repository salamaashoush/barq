import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Heading6(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12h8" />
      <path d="M4 18V6" />
      <path d="M12 18V6" />
      <circle cx="19" cy="16" r="2" />
      <path d="M20 10c-2 2-3 3.5-3 6" />
    </svg>
  );
}
