import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FishSymbol(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 16s9-15 20-4C11 23 2 8 2 8" />
    </svg>
  );
}
