import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterH(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 16V8" />
      <path d="M15 16V8" />
      <path d="M9 12h6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
