import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Undo(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}
