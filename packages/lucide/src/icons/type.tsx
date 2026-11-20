import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Type(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </svg>
  );
}
