import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Plus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
