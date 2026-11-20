import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MoveDown(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 18L12 22L16 18" />
      <path d="M12 2V22" />
    </svg>
  );
}
