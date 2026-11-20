import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextAlignJustifyCenter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 5h18" />
      <path d="M3 12h18" />
      <path d="M7 19h10" />
    </svg>
  );
}
