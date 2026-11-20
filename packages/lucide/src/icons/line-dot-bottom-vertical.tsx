import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function LineDotBottomVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v12" />
      <circle cx="12" cy="18" r="3" />
    </svg>
  );
}
