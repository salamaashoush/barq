import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RobotVacuum(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M11 17h2" />
      <path d="M12 12h.01" />
      <path d="M17 12a5 5 0 00-10 0" />
      <path d="M19 2v2.8" />
      <path d="M2 5h2.8" />
      <path d="M22 5h-2.8" />
      <path d="M5 2v2.8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
