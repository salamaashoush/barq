import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Crop(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}
