import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacCapricorn(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M11 21a3 3 0 0 0 3-3V6.5a1 1 0 0 0-7 0" />
      <path d="M7 19V6a3 3 0 0 0-3-3h0" />
      <circle cx="17" cy="17" r="3" />
    </svg>
  );
}
