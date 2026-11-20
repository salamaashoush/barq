import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SeparatorVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v18" />
      <path d="m16 16 4-4-4-4" />
      <path d="m8 8-4 4 4 4" />
    </svg>
  );
}
