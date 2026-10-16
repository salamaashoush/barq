import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ServerNas(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M10 16V8" />
      <path d="M14 16V8" />
      <path d="M18 16V8" />
      <path d="M6 12h.01" />
      <path d="M6 16h.01" />
      <rect x="2" y="4" width="20" height="16" rx="2" />
    </svg>
  );
}
