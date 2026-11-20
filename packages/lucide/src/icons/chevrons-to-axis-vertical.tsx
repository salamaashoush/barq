import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsToAxisVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v20" />
      <path d="m21 8-4 4 4 4" />
      <path d="m3 8 4 4-4 4" />
    </svg>
  );
}
