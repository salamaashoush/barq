import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function WavesVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2q2 2.5 0 5t0 5 0 5 0 5" />
      <path d="M19 2q2 2.5 0 5t0 5 0 5 0 5" />
      <path d="M5 2q2 2.5 0 5t0 5 0 5 0 5" />
    </svg>
  );
}
