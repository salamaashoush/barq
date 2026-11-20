import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MarginRight(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M21 3v18" />
    </svg>
  );
}
