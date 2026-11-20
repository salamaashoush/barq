import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Battery(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M 22 14 L 22 10" />
      <rect x="2" y="6" width="16" height="12" rx="2" />
    </svg>
  );
}
