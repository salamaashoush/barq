import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AudioLines(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </svg>
  );
}
