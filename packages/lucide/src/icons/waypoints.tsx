import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Waypoints(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m10.586 5.414-5.172 5.172" />
      <path d="m18.586 13.414-5.172 5.172" />
      <path d="M6 12h12" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="4" cy="12" r="2" />
    </svg>
  );
}
