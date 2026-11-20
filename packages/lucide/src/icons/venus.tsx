import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Venus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 15v7" />
      <path d="M9 19h6" />
      <circle cx="12" cy="9" r="6" />
    </svg>
  );
}
