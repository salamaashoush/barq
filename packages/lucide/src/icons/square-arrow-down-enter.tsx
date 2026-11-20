import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareArrowDownEnter(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v10" />
      <path d="M16 3h3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h3" />
      <path d="m8 9 4 4 4-4" />
    </svg>
  );
}
