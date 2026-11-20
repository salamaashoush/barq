import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotLeftHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 12h12" />
      <circle cx="6" cy="12" r="3" />
    </svg>
  );
}
