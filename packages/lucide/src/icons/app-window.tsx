import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AppWindow(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M10 4v4" />
      <path d="M2 8h20" />
      <path d="M6 4v4" />
    </svg>
  );
}
