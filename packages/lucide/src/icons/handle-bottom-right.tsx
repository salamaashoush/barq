import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HandleBottomRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 8 8 21" />
      <path d="m21 15-6 6" />
    </svg>
  );
}
