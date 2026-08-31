import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Summary(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M15 4H7" />
      <path d="m18 16 3 3-3 3" />
      <path d="M3 4v13a2 2 0 0 0 2 2h16" />
      <path d="M7 14h7" />
      <path d="M7 9h12" />
    </svg>
  );
}
