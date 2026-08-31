import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleUserRound(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M17.925 20.056a6 6 0 0 0-11.851.001" />
      <circle cx="12" cy="11" r="4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
