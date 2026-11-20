import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function X(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
