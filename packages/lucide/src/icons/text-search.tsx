import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function TextSearch(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M21 5H3" />
      <path d="M10 12H3" />
      <path d="M10 19H3" />
      <circle cx="17" cy="15" r="3" />
      <path d="m21 19-1.9-1.9" />
    </svg>
  );
}
