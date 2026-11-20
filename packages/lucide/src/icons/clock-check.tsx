import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ClockCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21.95 13a10 10 0 1 0-8.685 8.92" />
      <path d="M12 6v6l4 2" />
      <path d="m16 19 2 2 4-4" />
    </svg>
  );
}
