import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SpellCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m20 15-5.5 5.5L12 18" />
      <path d="m4 16 6-12 5.115 10.23" />
      <path d="M6 12h8" />
    </svg>
  );
}
