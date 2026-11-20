import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function XLineTop(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 4H6" />
      <path d="M18 8 6 20" />
      <path d="m6 8 12 12" />
    </svg>
  );
}
