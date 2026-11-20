import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListFilter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M2 5h20" />
      <path d="M6 12h12" />
      <path d="M9 19h6" />
    </svg>
  );
}
