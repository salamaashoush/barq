import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserSearch(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="10" cy="7" r="4" />
      <path d="M10.3 15H7a4 4 0 0 0-4 4v2" />
      <circle cx="17" cy="17" r="3" />
      <path d="m21 21-1.9-1.9" />
    </svg>
  );
}
