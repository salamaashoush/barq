import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PanelBottomDashed(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M14 15h1" />
      <path d="M19 15h2" />
      <path d="M3 15h2" />
      <path d="M9 15h1" />
    </svg>
  );
}
