import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BangladeshiTaka(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M6 5a2 2 0 0 1 4 0v12a4 4 0 0 0 8 0 2 2 0 0 0-4 0" />
      <path d="M6 9h12" />
    </svg>
  );
}
