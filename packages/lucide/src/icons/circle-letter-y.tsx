import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterY(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="m9 8 3 4 3-4" />
      <path d="M12 12v4" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
