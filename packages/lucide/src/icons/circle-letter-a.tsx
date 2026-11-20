import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterA(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 14H9" />
      <circle cx="12" cy="12" r="10" />
      <path d="m8 16 3.453-7.648a.6.6 0 0 1 1.094 0L16 16" />
    </svg>
  );
}
