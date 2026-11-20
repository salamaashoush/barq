import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function StrokeWidth(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3.25 3h17.5" />
      <rect x="3" y="7" width="18" height="4" rx="1" />
      <rect x="3" y="15" width="18" height="6" rx="1" />
    </svg>
  );
}
