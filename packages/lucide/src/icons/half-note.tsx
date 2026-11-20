import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HalfNote(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="18" r="4" />
      <path d="M16 18V2" />
    </svg>
  );
}
