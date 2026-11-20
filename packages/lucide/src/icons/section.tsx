import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Section(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 5a4 3 0 0 0-8 0c0 4 8 3 8 7a4 3 0 0 1-8 0" />
      <path d="M8 19a4 3 0 0 0 8 0c0-4-8-3-8-7a4 3 0 0 1 8 0" />
    </svg>
  );
}
