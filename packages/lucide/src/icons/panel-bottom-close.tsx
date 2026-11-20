import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function PanelBottomClose(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 15h18" />
      <path d="m15 8-3 3-3-3" />
    </svg>
  );
}
