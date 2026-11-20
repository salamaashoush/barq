import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Redo(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}
