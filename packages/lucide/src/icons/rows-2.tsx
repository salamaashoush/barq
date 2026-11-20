import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Rows2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 12h18" />
    </svg>
  );
}
