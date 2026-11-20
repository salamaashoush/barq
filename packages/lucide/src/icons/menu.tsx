import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Menu(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </svg>
  );
}
