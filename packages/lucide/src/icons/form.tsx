import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Form(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 14h6" />
      <path d="M4 2h10" />
      <rect x="4" y="18" width="16" height="4" rx="1" />
      <rect x="4" y="6" width="16" height="4" rx="1" />
    </svg>
  );
}
