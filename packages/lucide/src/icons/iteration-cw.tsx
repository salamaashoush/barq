import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function IterationCw(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 10a8 8 0 1 1 8 8H4" />
      <path d="m8 22-4-4 4-4" />
    </svg>
  );
}
