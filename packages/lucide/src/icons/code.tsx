import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Code(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}
