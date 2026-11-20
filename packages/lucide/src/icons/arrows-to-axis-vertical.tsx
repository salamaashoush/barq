import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsToAxisVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 22V2" />
      <path d="M16 12h6" />
      <path d="m19 15-3-3 3-3" />
      <path d="M2 12h6" />
      <path d="m5 15 3-3-3-3" />
    </svg>
  );
}
