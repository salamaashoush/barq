import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Proportions(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M12 9v11" />
      <path d="M2 9h13a2 2 0 0 1 2 2v9" />
    </svg>
  );
}
