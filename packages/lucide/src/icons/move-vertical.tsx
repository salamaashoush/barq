import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v20" />
      <path d="m8 18 4 4 4-4" />
      <path d="m8 6 4-4 4 4" />
    </svg>
  );
}
