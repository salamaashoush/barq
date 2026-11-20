import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CirclePercent(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="M9 9h.01" />
      <path d="M15 15h.01" />
    </svg>
  );
}
