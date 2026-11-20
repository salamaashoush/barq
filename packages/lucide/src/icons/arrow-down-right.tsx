import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m7 7 10 10" />
      <path d="M17 7v10H7" />
    </svg>
  );
}
