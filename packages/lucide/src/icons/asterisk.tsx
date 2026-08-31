import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Asterisk(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 5v14" />
      <path d="m18.065 8.496-12.125 7" />
      <path d="m5.94 8.504 12.125 7" />
    </svg>
  );
}
