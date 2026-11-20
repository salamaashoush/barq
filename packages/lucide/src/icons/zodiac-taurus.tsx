import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacTaurus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="15" r="6" />
      <path d="M18 3A6 6 0 0 1 6 3" />
    </svg>
  );
}
