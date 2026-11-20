import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TableOfContents(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M16 19H3" />
      <path d="M21 5h.01" />
      <path d="M21 12h.01" />
      <path d="M21 19h.01" />
    </svg>
  );
}
