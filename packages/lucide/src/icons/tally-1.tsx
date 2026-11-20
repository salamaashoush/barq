import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Tally1(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 4v16" />
    </svg>
  );
}
