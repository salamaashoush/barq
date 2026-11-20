import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Power(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </svg>
  );
}
