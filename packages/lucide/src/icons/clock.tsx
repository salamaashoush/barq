import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Clock(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
