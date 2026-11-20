import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Pilcrow(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13 4v16" />
      <path d="M17 4v16" />
      <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
    </svg>
  );
}
