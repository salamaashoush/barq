import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Thermometer(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </svg>
  );
}
