import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotTopVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 9v12" />
      <circle cx="12" cy="6" r="3" />
    </svg>
  );
}
