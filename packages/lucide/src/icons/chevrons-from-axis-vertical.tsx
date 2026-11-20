import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronsFromAxisVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v20" />
      <path d="m17 8 4 4-4 4" />
      <path d="m7 8-4 4 4 4" />
    </svg>
  );
}
