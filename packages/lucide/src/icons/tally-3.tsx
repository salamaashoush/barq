import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tally3(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 4v16" />
      <path d="M9 4v16" />
      <path d="M14 4v16" />
    </svg>
  );
}
