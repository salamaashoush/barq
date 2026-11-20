import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineSquiggle(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2" />
    </svg>
  );
}
