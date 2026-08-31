import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PanelRightDashed(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 14v1" />
      <path d="M15 19v2" />
      <path d="M15 3v2" />
      <path d="M15 9v1" />
    </svg>
  );
}
