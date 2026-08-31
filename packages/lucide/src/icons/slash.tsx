import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Slash(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 2 2 22" />
    </svg>
  );
}
