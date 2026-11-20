import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Barrel(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M10.5 2a34.5 34.5 0 000 20" />
      <path d="M13.5 2a34.5 34.5 0 010 20" />
      <path d="M4.67 17h14.67" />
      <path d="M4.67 7h14.67" />
      <path d="M6.23 3.06a19 19 0 000 17.88A2 2 0 008 22h8a2 2 0 001.77-1.06 19 19 0 000-17.88A2 2 0 0016 2H8a2 2 0 00-1.77 1.06" />
    </svg>
  );
}
