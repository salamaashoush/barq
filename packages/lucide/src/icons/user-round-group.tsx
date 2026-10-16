import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserRoundGroup(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17 21a5 5 0 00-10 0" />
      <path d="M22 10.5a3.5 3.5 0 00-5.507-2.868" />
      <path d="M7.507 7.632A3.5 3.5 0 002 10.5" />
      <circle cx="12" cy="13" r="3" />
      <circle cx="18.5" cy="4.5" r="2.5" />
      <circle cx="5.5" cy="4.5" r="2.5" />
    </svg>
  );
}
