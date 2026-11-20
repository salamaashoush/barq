import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ZodiacPisces(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 21a15 15 0 0 1 0-18" />
      <path d="M20 12H4" />
      <path d="M5 3a15 15 0 0 1 0 18" />
    </svg>
  );
}
