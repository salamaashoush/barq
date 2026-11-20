import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Search(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}
