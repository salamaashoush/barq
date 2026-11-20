import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LensConvex(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13.433 2a1 1 0 0 1 .824.448 18 18 0 0 1 0 19.104 1 1 0 0 1-.824.448h-2.866a1 1 0 0 1-.824-.448 18 18 0 0 1 0-19.104A1 1 0 0 1 10.567 2z" />
    </svg>
  );
}
