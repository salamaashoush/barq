import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SwissFranc(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10 10h7" />
      <path d="M10 20V5a1 1 0 011-1h7" />
      <path d="M6 16h9" />
    </svg>
  );
}
