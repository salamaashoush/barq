import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Margin(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M21 6v12" />
      <path d="M3 6v12" />
      <path d="M6 21h12" />
      <path d="M6 3h12" />
    </svg>
  );
}
