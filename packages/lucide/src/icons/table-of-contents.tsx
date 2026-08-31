import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TableOfContents(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M16 19H3" />
      <path d="M21 5h.01" />
      <path d="M21 12h.01" />
      <path d="M21 19h.01" />
    </svg>
  );
}
