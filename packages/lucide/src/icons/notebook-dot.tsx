import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function NotebookDot(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 11.75V22" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <path d="M2 6h4" />
      <path d="M20 11.75V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5.65" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}
