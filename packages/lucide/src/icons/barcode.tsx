import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Barcode(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 5v14" />
      <path d="M8 5v14" />
      <path d="M12 5v14" />
      <path d="M17 5v14" />
      <path d="M21 5v14" />
    </svg>
  );
}
