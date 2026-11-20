import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Cloud(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}
