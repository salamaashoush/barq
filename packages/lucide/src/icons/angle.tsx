import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Angle(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M3 11a10 10 0 0 1 10 10" />
    </svg>
  );
}
