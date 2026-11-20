import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AppWindowMac(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M6 8h.01" />
      <path d="M10 8h.01" />
      <path d="M14 8h.01" />
    </svg>
  );
}
