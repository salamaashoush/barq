import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignVerticalJustifyCenter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="14" height="6" x="5" y="16" rx="2" />
      <rect width="10" height="6" x="7" y="2" rx="2" />
      <path d="M2 12h20" />
    </svg>
  );
}
