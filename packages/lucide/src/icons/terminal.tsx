import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Terminal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 19h8" />
      <path d="m4 17 6-6-6-6" />
    </svg>
  );
}
