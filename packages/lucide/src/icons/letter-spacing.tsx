import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LetterSpacing(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 14H9" />
      <path d="M21 3v18" />
      <path d="M3 3v18" />
      <path d="m8 16 3.453-7.648a.6.6 0 011.094.001L16 16" />
    </svg>
  );
}
