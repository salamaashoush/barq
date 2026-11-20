import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Disc2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12h.01" />
    </svg>
  );
}
