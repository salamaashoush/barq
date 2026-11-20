import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Contrast(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 18a6 6 0 0 0 0-12v12z" />
    </svg>
  );
}
