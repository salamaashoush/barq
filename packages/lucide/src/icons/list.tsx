import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function List(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 5h.01" />
      <path d="M3 12h.01" />
      <path d="M3 19h.01" />
      <path d="M8 5h13" />
      <path d="M8 12h13" />
      <path d="M8 19h13" />
    </svg>
  );
}
