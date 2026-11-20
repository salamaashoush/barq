import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowLeftRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  );
}
