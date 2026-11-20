import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextCursor(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1" />
      <path d="M7 22h1a4 4 0 0 0 4-4" />
      <path d="M7 2h1a4 4 0 0 1 4 4" />
    </svg>
  );
}
