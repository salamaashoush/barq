import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Slash(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M22 2 2 22" />
    </svg>
  );
}
