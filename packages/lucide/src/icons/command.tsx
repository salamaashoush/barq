import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Command(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
    </svg>
  );
}
