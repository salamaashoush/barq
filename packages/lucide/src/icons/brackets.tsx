import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Brackets(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3" />
      <path d="M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3" />
    </svg>
  );
}
