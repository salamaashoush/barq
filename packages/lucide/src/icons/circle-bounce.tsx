import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleBounce(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 13c2.5.5 5 4 5 8 0-2.16 1.813-7.536 6-11.293" />
      <circle cx="19" cy="6" r="3" />
    </svg>
  );
}
