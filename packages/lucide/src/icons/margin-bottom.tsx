import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MarginBottom(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M3 21h18" />
    </svg>
  );
}
