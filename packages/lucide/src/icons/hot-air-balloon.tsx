import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HotAirBalloon(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11.5 18C10 15 9 12 9 9a3 7 0 0 1 6 0c0 3-1 6-2.5 9" />
      <path d="M15 18c3-3 5-5 5-9A8 7 0 0 0 4 9c0 4 2 6 5 9" />
      <path d="M15 18H9v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1z" />
    </svg>
  );
}
