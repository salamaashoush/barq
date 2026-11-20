import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AlignHorizontalSpaceAround(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="6" height="10" x="9" y="7" rx="2" />
      <path d="M4 22V2" />
      <path d="M20 22V2" />
    </svg>
  );
}
