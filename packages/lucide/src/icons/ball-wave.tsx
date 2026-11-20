import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BallWave(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 20c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M7.757 13.243a2 6 45 1 0 8.486-8.486 2 6 45 1 0-8.486 8.486" />
      <circle cx="12" cy="9" r="6" />
    </svg>
  );
}
