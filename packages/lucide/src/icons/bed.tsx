import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Bed(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" />
      <path d="M6 8v9" />
    </svg>
  );
}
