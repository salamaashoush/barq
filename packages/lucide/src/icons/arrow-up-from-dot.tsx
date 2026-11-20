import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpFromDot(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m5 9 7-7 7 7" />
      <path d="M12 16V2" />
      <circle cx="12" cy="21" r="1" />
    </svg>
  );
}
