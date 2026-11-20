import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CornerDownRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m15 10 5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </svg>
  );
}
