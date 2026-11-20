import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignJustifyEnd(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 5h18" />
      <path d="M3 12h18" />
      <path d="M11 19h10" />
    </svg>
  );
}
